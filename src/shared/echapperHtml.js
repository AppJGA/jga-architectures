// Échappe un texte saisi par un utilisateur avant de l'insérer dans du HTML
// généré (exports PDF) : un nom de tâche contenant « < » ou « & » ne doit ni
// disparaître ni injecter de balise dans la fenêtre d'impression, qui partage
// l'origine — et donc la session — de l'application.
export function echapperHtml(valeur) {
  return String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
