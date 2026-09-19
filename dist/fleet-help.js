// Shared, keyboard-accessible contextual menus. Native dialogs retain focus;
// the fallback is for environments without HTMLDialogElement.showModal.
export function openFleetDialog(dialog) {
  const previous = dialog.ownerDocument.activeElement;
  dialog._returnFocus = previous;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  dialog.querySelector('textarea,input,button')?.focus();
}
export function closeFleetDialog(dialog) {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
  dialog._returnFocus?.focus();
}
export function fleetHelp(document, { title, text, actions = [] }) {
  let dialog = document.getElementById('fleetHelpDialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'fleetHelpDialog';
    dialog.className = 'fleet-dialog';
    document.body.append(dialog);
    dialog.addEventListener('keydown', (e) => e.stopPropagation());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) closeFleetDialog(dialog);
    });
  }
  dialog.replaceChildren();
  dialog.setAttribute('aria-labelledby', 'fleetHelpTitle');
  const heading = document.createElement('h2');
  heading.id = 'fleetHelpTitle';
  heading.textContent = title;
  const description = document.createElement('p');
  description.textContent = text;
  dialog.append(heading, description);
  const menu = document.createElement('div');
  menu.className = 'fleet-dialog-actions';
  for (const action of actions) {
    const button = document.createElement('button');
    button.textContent = action.label;
    button.addEventListener('click', () => {
      closeFleetDialog(dialog);
      action.run();
    });
    menu.append(button);
  }
  const close = document.createElement('button');
  close.textContent = 'Back to controls';
  close.addEventListener('click', () => closeFleetDialog(dialog));
  menu.append(close);
  dialog.append(menu);
  openFleetDialog(dialog);
  return dialog;
}
