const translations = {
  pl: {
    workspace: 'Konwersja', guest: 'Gość', profile: 'Profil użytkownika',
    profileInfo: 'Tryb gościa · podgląd interfejsu', heading: 'Konwerter blankietów',
    intro: 'Przygotuj formularz w formacie JSON dla importera COI.',
    new: 'Nowa konwersja', drag: 'Przeciągnij blankiet', or: 'lub wybierz plik z urządzenia',
    choose: 'Wybierz plik', convert: 'Pokaż przykładowy wynik', result: 'Wynik konwersji',
    waiting: 'Oczekiwanie na plik', ready: 'Plik wybrany', shown: 'Przykładowy wynik',
    preview: 'Podgląd JSON', download: 'Pobierz przykładowy JSON',
    theme: 'Zmień motyw', language: 'Język', remove: 'Usuń plik'
  },
  en: {
    workspace: 'Conversion', guest: 'Guest', profile: 'User profile',
    profileInfo: 'Guest mode · interface preview', heading: 'Form converter',
    intro: 'Prepare a form in JSON format for the COI importer.',
    new: 'New conversion', drag: 'Drop a blank form here', or: 'or choose a file from your device',
    choose: 'Choose file', convert: 'Show sample result', result: 'Conversion result',
    waiting: 'Waiting for a file', ready: 'File selected', shown: 'Sample result',
    preview: 'JSON preview', download: 'Download sample JSON',
    theme: 'Switch theme', language: 'Language', remove: 'Remove file'
  }
};

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const theme = $('theme');
const language = $('language');
const input = $('file');
const drop = $('drop');
let selectedFile;
let sampleResult;

function readPreference(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function savePreference(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Preferences still apply for this page. */ }
}

function render() {
  const copy = translations[language.value];
  root.lang = language.value;
  for (const element of document.querySelectorAll('[data-text]')) {
    element.textContent = copy[element.dataset.text];
  }
  theme.textContent = root.dataset.theme === 'dark' ? '☀' : '☾';
  theme.title = copy.theme;
  theme.setAttribute('aria-label', copy.theme);
  language.setAttribute('aria-label', copy.language);
  $('remove').setAttribute('aria-label', copy.remove);
  $('status').textContent = copy[sampleResult ? 'shown' : selectedFile ? 'ready' : 'waiting'];
  $('selected').hidden = !selectedFile;
  $('filename').textContent = selectedFile?.name ?? '';
  $('convert').disabled = !selectedFile;
  $('download').disabled = !sampleResult;
  $('output').textContent = sampleResult ?? '—';
}

function selectFile(file) {
  selectedFile = file;
  sampleResult = undefined;
  render();
}

root.dataset.theme = readPreference('formiq-theme') === 'light' ? 'light' : 'dark';
language.value = readPreference('formiq-language') === 'en' ? 'en' : 'pl';
render();

theme.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  savePreference('formiq-theme', root.dataset.theme);
  render();
});
language.addEventListener('change', () => {
  savePreference('formiq-language', language.value);
  render();
});
$('choose').addEventListener('click', () => input.click());
input.addEventListener('change', () => {
  if (input.files[0]) selectFile(input.files[0]);
});
drop.addEventListener('dragover', (event) => {
  event.preventDefault();
  drop.classList.add('dragging');
});
drop.addEventListener('dragleave', (event) => {
  if (!drop.contains(event.relatedTarget)) drop.classList.remove('dragging');
});
drop.addEventListener('drop', (event) => {
  event.preventDefault();
  drop.classList.remove('dragging');
  if (event.dataTransfer.files[0]) {
    input.value = '';
    selectFile(event.dataTransfer.files[0]);
  }
});
$('remove').addEventListener('click', () => {
  input.value = '';
  selectFile(undefined);
  $('choose').focus();
});
$('convert').addEventListener('click', () => {
  sampleResult = JSON.stringify({ title: 'Wniosek o stwierdzenie nadpłaty', pages: 3 }, null, 2);
  render();
});
$('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([sampleResult], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'formiq-example.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
