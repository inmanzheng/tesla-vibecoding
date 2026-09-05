export async function readLocalClipboardText(): Promise<string> {
  const clipboard = window.navigator?.clipboard;
  if (typeof clipboard?.readText !== "function") {
    throw new Error("当前浏览器不允许读取本机剪贴板");
  }
  return clipboard.readText();
}
