// Firestore document ids can't contain "/" or be "." / "..", and bibs and judge
// names are free text, so every id built from them goes through here.
export const toDocId = (value: string) => encodeURIComponent(value).replace(/\./g, "%2E");

// A judge has one score per dancer in a contest, so re-scoring overwrites it.
export const getScoreDocId = (judgeId: string, competitorBib: string) =>
  `${toDocId(judgeId)}__${toDocId(competitorBib)}`;
