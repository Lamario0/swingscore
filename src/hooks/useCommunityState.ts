import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, type FirestoreError, type QuerySnapshot, type Unsubscribe } from "firebase/firestore";
import { db } from "../firebase";
import { AppSettings, CompletedContestResult, Competitor, GatewaySession, Heat, ScoreRecord } from "../types";
import { SESSION_EXPIRED_EVENT } from "../utils/api";
import { toDocId } from "../utils/ids";

const DEFAULT_SETTINGS: AppSettings = {
  currentHeatId: null,
  judgingStyle: "raw",
  callbackCount: 3,
  callbackCountLeaders: 3,
  callbackCountFollowers: 3,
  alternateCountLeaders: 2,
  alternateCountFollowers: 2
};

// Which contests' scores a public device may read. firestore.rules holds the same check.
export const getPublicHeatIds = (settings: AppSettings) => [
  ...(settings.publishedHeatIds || []),
  ...(settings.isPublished && settings.currentHeatId ? [settings.currentHeatId] : [])
];

// Registration staff handle dancers, not results. firestore.rules holds the same check.
export const canReadAllScores = (session: GatewaySession | null) =>
  !!session?.roles.some((role) => role !== "competitor");

const ROLE_CHANGE_RETRY_DELAYS_MS = [500, 1000, 2000, 4000];

// A token with new roles takes a moment to reach Firestore, longer when another
// tab holds the connection, so a listener that needs a role just gained can be
// refused at first. A refused listener stays closed, so start it again.
export function listenThroughRoleChange(
  listen: (onError: (err: FirestoreError) => void) => Unsubscribe,
  giveUp: (err: FirestoreError) => void
): Unsubscribe {
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout>;
  let unsubscribe: Unsubscribe;
  const start = () => {
    unsubscribe = listen((err) => {
      if (err.code === "permission-denied" && attempt < ROLE_CHANGE_RETRY_DELAYS_MS.length) {
        timer = setTimeout(start, ROLE_CHANGE_RETRY_DELAYS_MS[attempt++]);
      } else {
        giveUp(err);
      }
    });
  };
  start();
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}

const sortCompetitors = (list: Competitor[]) =>
  list.sort((a, b) => a.bib.localeCompare(b.bib, undefined, { numeric: true }));

// A community's live data, in the same shape the portals have always received.
// Each list is a Firestore listener, so every device sees a change immediately.
export function useCommunityState(session: GatewaySession | null) {
  const communityId = session?.communityId;
  const isStaff = canReadAllScores(session);
  const canReadEmails = !!session && session.roles.some((role) => role !== "judge");

  const [communityName, setCommunityName] = useState("");
  const [baseCompetitors, setBaseCompetitors] = useState<Competitor[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [heats, setHeats] = useState<Heat[]>([]);
  const [results, setResults] = useState<CompletedContestResult[]>([]);
  const [baseSettings, setBaseSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [scoresByHeat, setScoresByHeat] = useState<Record<string, ScoreRecord[]>>({});
  const [unsyncedHeats, setUnsyncedHeats] = useState<Record<string, boolean>>({});
  const [loadedLists, setLoadedLists] = useState<Record<string, boolean>>({});
  const [hasFinishedFirstLoad, setHasFinishedFirstLoad] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!communityId) return;
    setLoadedLists({});
    const root = `communities/${communityId}`;
    const markLoaded = (name: string) => setLoadedLists((prev) => (prev[name] ? prev : { ...prev, [name]: true }));
    // Losing access means this device's codes were changed or the plan lapsed.
    const onError = (err: FirestoreError) => {
      console.error("Lost a live data connection", err);
      if (err.code === "permission-denied") {
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      } else {
        setError("Lost connection to the scoring database. Retrying...");
      }
    };
    const listen = <T,>(name: string, apply: (docs: T[], snapshot: QuerySnapshot) => void) =>
      onSnapshot(collection(db, `${root}/${name}`), (snapshot) => {
        apply(snapshot.docs.map((d) => d.data() as T), snapshot);
        markLoaded(name);
      }, onError);

    const unsubscribers = [
      onSnapshot(doc(db, root), (snapshot) => setCommunityName(snapshot.data()?.name || ""), onError),
      onSnapshot(doc(db, `${root}/settings/main`), { includeMetadataChanges: true }, (snapshot) => {
        if (snapshot.exists()) setBaseSettings(snapshot.data() as AppSettings);
        // Served from the device's cache means Firestore can't reach the server.
        setIsOffline(snapshot.metadata.fromCache);
        setError("");
        markLoaded("settings");
      }, onError),
      listen<Competitor>("competitors", (docs) => setBaseCompetitors(sortCompetitors(docs))),
      listen<Heat>("heats", setHeats),
      listen<CompletedContestResult & { order: number }>("results", (docs) => {
        setResults(docs.sort((a, b) => a.order - b.order));
      })
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [communityId]);

  useEffect(() => {
    if (!communityId || !canReadEmails) return;
    return listenThroughRoleChange(
      (onError) => onSnapshot(collection(db, `communities/${communityId}/competitorPrivate`), (snapshot) => {
        setEmails(Object.fromEntries(snapshot.docs.map((d) => [d.id, d.data().email])));
      }, onError),
      (err) => console.error("Could not load dancer emails", err)
    );
  }, [communityId, canReadEmails]);

  // Scores are stored under each contest. Staff listen to every contest; public
  // devices only to the ones the rules let them read.
  const scoreHeatIdsKey = useMemo(() => {
    const ids = isStaff ? heats.map((h) => h.id) : getPublicHeatIds(baseSettings).filter((id) => heats.some((h) => h.id === id));
    return JSON.stringify([...new Set(ids)].sort());
  }, [isStaff, heats, baseSettings]);

  useEffect(() => {
    if (!communityId) return;
    const heatIds: string[] = JSON.parse(scoreHeatIdsKey);
    const unsubscribers = heatIds.map((heatId) =>
      listenThroughRoleChange(
        (onError) => onSnapshot(
          collection(db, `communities/${communityId}/heats/${toDocId(heatId)}/scores`),
          { includeMetadataChanges: true },
          (snapshot) => {
            setScoresByHeat((prev) => ({ ...prev, [heatId]: snapshot.docs.map((d) => d.data() as ScoreRecord) }));
            setUnsyncedHeats((prev) => ({ ...prev, [heatId]: snapshot.metadata.hasPendingWrites }));
          },
          onError
        ),
        (err) => {
          console.error("Could not load a contest's scores", err);
          setScoresByHeat((prev) => ({ ...prev, [heatId]: prev[heatId] || [] }));
        }
      )
    );
    setScoresByHeat((prev) => Object.fromEntries(heatIds.filter((id) => prev[id]).map((id) => [id, prev[id]])));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [communityId, scoreHeatIdsKey]);

  // Portals read their first data once (a judge's sheet fills in from their saved
  // scores), so the first load waits for everything. Contests added later load
  // in the background: the page mustn't go back to a spinner mid-event.
  const isEverythingLoaded = ["settings", "competitors", "heats", "results"].every((name) => loadedLists[name])
    && (JSON.parse(scoreHeatIdsKey) as string[]).every((heatId) => scoresByHeat[heatId]);
  useEffect(() => {
    if (isEverythingLoaded) setHasFinishedFirstLoad(true);
  }, [isEverythingLoaded]);

  const competitors = useMemo(
    () => baseCompetitors.map((c) => {
      const email = emails[toDocId(c.bib)];
      return email ? { ...c, email } : c;
    }),
    [baseCompetitors, emails]
  );
  const scores = useMemo(() => Object.values(scoresByHeat).flat(), [scoresByHeat]);
  const settings = useMemo(() => ({ ...baseSettings, completedResults: results }), [baseSettings, results]);

  return {
    communityName,
    competitors,
    heats,
    scores,
    settings,
    error,
    isOffline,
    hasUnsyncedScores: Object.values(unsyncedHeats).some(Boolean),
    loading: !hasFinishedFirstLoad
  };
}
