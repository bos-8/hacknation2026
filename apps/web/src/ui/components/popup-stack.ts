/** Registration follows showModal order, which also defines the browser top layer. */
const stack: HTMLDialogElement[] = [];

export function registerPopup(dialog: HTMLDialogElement) {
  stack.push(dialog);
  return () => { const index = stack.indexOf(dialog); if (index !== -1) stack.splice(index, 1); };
}

export function isTopPopup(dialog: HTMLDialogElement) {
  return stack.findLast(item => item.isConnected && item.open) === dialog;
}
