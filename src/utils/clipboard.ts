// Browsers can refuse the modern clipboard, as they do on a plain http address,
// so this falls back to the older way of copying a selection.
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const didCopy = document.execCommand("copy");
    field.remove();
    return didCopy;
  }
}
