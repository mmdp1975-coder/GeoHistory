// frontend/lib/i18n/uiLabels.ts
// Dizionario per le label dell'interfaccia (UI), multi-lingua.
// Contiene le chiavi usate in TopBar, Landing, Timeline, Scorecard, RatingStars,
// RatingSummary e GlobeCanvas.

export type SupportedUILang = "en" | "it";

type UIDictionary = Record<string, string>;

const en: UIDictionary = {
  // APP / LOGO
  "app.title": "GeoHistory Journey",
  "topbar.logo.ariaLabel": "GeoHistory Journey",
  "topbar.motto": "Where time and space turn into stories",

  // TOPBAR – pulsanti principali
  "topbar.home": "Home",
  "topbar.home.title": "Home",
  "topbar.back": "Back",
  "topbar.back.title": "Back",
  "topbar.settings": "Settings",
  "topbar.settings.title": "Settings",
  "topbar.guide": "Guide",
  "topbar.guide.title": "Watch the intro video",
  "topbar.guide.ariaLabel": "Watch the intro video",
  "topbar.logout": "Logout",
  "topbar.logout.title": "Logout",

  // VIDEO OVERLAY
  "video.close.ariaLabel": "Close video",
  "video.close.title": "Close video",
  "video.unsupported": "Your browser does not support the video tag.",
  "video.volume.label": "Volume control",
  "video.playbackError":
    "Press play or unlock the audio from the player to listen to the video.",

  // LANDING – welcome
  "landing.welcome.base": "Welcome to GeoHistory",
  "landing.welcome.text":
    "Travel through centuries and continents to uncover how human events shaped our world. Choose your path: explore by age, place, or theme.",

  // LANDING – timeline block
  "landing.timeline.title": "Timeline Explorer",
  "landing.timeline.button": "Explore Ages",

  // LANDING – discover block
  "landing.discover.title": "Discover",
  "landing.discover.card.most_rated.title": "Most Rated",
  "landing.discover.card.most_rated.text":
    "Top-rated journeys and events.",
  "landing.discover.card.favourites.title": "Favourites",
  "landing.discover.card.favourites.text": "Your saved journeys.",
  "landing.discover.card.new_journeys.title": "New Journeys",
  "landing.discover.card.new_journeys.text":
    "Latest journeys published by users.",
  "landing.discover.card.build_journey.title": "Build Journey",
  "landing.discover.card.build_journey.text":
    "Create or edit your own multi-event journey.",

  // LANDING – globe block
  "landing.globe.title": "Globe Explorer",
  "landing.globe.button": "Explore Places",

  // TIMELINE – header
  "timeline.header.title": "Timeline Explorer",
  "timeline.header.checking": "Checking…",
  "timeline.header.guest": "Guest",
  "timeline.header.from": "From",
  "timeline.header.to": "To",
  "timeline.header.show_all": "Show All",
  "timeline.header.show_all.title": "Reset range, text and geo filter",

  // TIMELINE – geo badge
  "timeline.geo.badge.label": "Geo filter",
  "timeline.geo.badge.clear": "Clear geo filter",
  "timeline.geo.badge.clear.title": "Remove geo filter",

  // TIMELINE – timeline bar
  "timeline.timeline.loading": "Loading timeline…",

  // TIMELINE – summary / search / no results
  "timeline.summary.initializing": "Initializing…",
  "timeline.summary.loading": "Loading results…",
  "timeline.summary.in_range_prefix": "In range:",
  "timeline.summary.group_events": "group events",
  "timeline.summary.total_events_prefix": "total matched events",
  "timeline.search.label": "Free text search",
  "timeline.search.placeholder": "Type to filter…",
  "timeline.search.clear": "Clear",
  "timeline.search.clear.title": "Clear text and keep only time range",
  "timeline.no_results":
    "No journeys found. Try changing the timeframe or clearing the search.",

  // FAVOURITES – generic messages
  "favourites.login_required": "Please sign in to use favourites.",
  "favourites.toggle_error": "Unable to toggle favourite.",

  // SCORECARD – cover / immagini
  "scorecard.cover.missing": "No cover",

  // SCORECARD – preferiti (stato)
  "scorecard.favourite.state.yes": "In your favourites",
  "scorecard.favourite.state.no": "Not in your favourites",
  "scorecard.favourite.state.generic": "Favourite state",

  // SCORECARD – preferiti (azioni)
  "scorecard.favourite.action.add": "Add to favourites",
  "scorecard.favourite.action.remove": "Remove from favourites",

  // SCORECARD – data pubblicazione
  "scorecard.publication_date.title": "Publication date",

  // SCORECARD – eventi
  "scorecard.events.count_title": "Events count",
  "scorecard.events.count_suffix": "events",

  // SCORECARD – arco temporale
  "scorecard.timespan.title": "Time span",

  // SCORECARD – CTA
  "scorecard.cta.open": "Open",

  // RATING STARS
  "rating.stars.rate_prefix": "Rate",
  "rating.stars.login_required": "Please sign in to rate",

  // RATING SUMMARY
  "rating.summary.no_ratings": "No ratings",
  "rating.summary.votes": "votes",

  // JOURNEY – group_event detail
  "journey.loading": "Loading journey…",
  "journey.error": "Error",
  "journey.back": "Back",
  "journey.title_fallback": "Journey",
  "journey.related_from.fallback": "Origin journey",
  "journey.concurrent.none": "No concurrent events.",
  "journey.related.title": "Related journeys",
  "journey.related.none": "No related journeys.",
  "journey.related.open_button": "Open journey",
  "journey.media.title": "Journey media",
  "journey.media.none": "No media for this journey.",

  // GLOBE – footer
  "globe.footer.lat": "Lat:",
  "globe.footer.lon": "Lon:",
  "globe.footer.city_radius": "City radius (km):",
  "globe.footer.continent": "Continent:",
  "globe.footer.country": "Country:",
  "globe.footer.nearest_city": "Nearest city:",
  "globe.unknown": "Unknown",

  // GENERIC
  "generic.loading": "Loading...",

  // BUILD JOURNEY
  "build.tab.journey": "Journey",
  "build.tab.events": "Events",
  "build.group.tab.general": "General",
  "build.group.tab.translations": "Translations",
  "build.group.tab.media": "Media",
  "build.event.tab.when_where": "When & where",
  "build.event.tab.translations": "Translations",
  "build.event.tab.media": "Media",
  "build.event.tab.details": "Details",

  "build.actions.new": "New",
  "build.actions.save": "Save",
  "build.actions.save.loading": "Saving...",
  "build.actions.approval": "Ask for approval",
  "build.actions.approval.loading": "Sending...",
  "build.actions.delete": "Delete",
  "build.actions.delete.loading": "Deleting...",
  "build.actions.edit": "Edit",
  "build.actions.close": "Close",
  "build.actions.show_journeys": "Show journeys",

  "build.sidebar.visibility": "Visibility",
  "build.sidebar.filter.all": "All",
  "build.sidebar.filter.public": "Public",
  "build.sidebar.filter.private": "Private",
  "build.sidebar.order": "Order",
  "build.sidebar.sort.last": "Last approved",
  "build.sidebar.sort.first": "First approved",
  "build.sidebar.saved": "saved",
  "build.sidebar.of": "of",
  "build.sidebar.saved_filtered": "saved (filtered)",
  "build.sidebar.loading": "Loading journeys.",
  "build.sidebar.empty": "No saved journeys. Create a new flow.",
  "build.sidebar.no_match": "No journey matches the active filter.",
  "build.sidebar.checking": "Checking session...",
  "build.sidebar.login": "Sign in to save journeys.",
  "build.sidebar.profile": "Profile:",

  "build.group.visibility": "Visibility",
  "build.group.workflow": "Workflow state",
  "build.group.audience": "Audience flags",
  "build.group.slug": "Slug",
  "build.group.slug.placeholder": "e.g. age-of-exploration",
  "build.group.code": "Code",
  "build.group.code.placeholder": "e.g. EXP001",
  "build.group.owner": "Owner profile",
  "build.group.created_at": "Created at",
  "build.group.updated_at": "Updated at",
  "build.group.approved_by": "Approved by profile",
  "build.group.approved_at": "Approved at",
  "build.group.requested_at": "Requested approval at",
  "build.group.refused_by": "Refused by profile",
  "build.group.refused_at": "Refused at",
  "build.group.refusal_reason": "Refusal reason",
  "build.group.refusal_reason.placeholder": "Explain why it was refused",
  "build.group.workflow.draft": "draft",

  "build.audience.fan": "Allow fan",
  "build.audience.stud_high": "Allow stud high",
  "build.audience.stud_middle": "Allow stud middle",
  "build.audience.stud_primary": "Allow stud primary",

  "build.media.filter_all": "All",
  "build.media.add": "Add media",
  "build.media.filter_prefix": "Filtered media type:",
  "build.media.empty": "No media linked.",
  "build.media.order": "Order",
  "build.media.title": "Title",
  "build.media.title.placeholder": "Asset title",
  "build.media.type": "Type",
  "build.media.delete": "Delete",
  "build.media.public_url": "Public URL",
  "build.media.source_url": "Source URL",
  "build.media.url.placeholder": "https://",
  "build.media.kind.image": "Image",
  "build.media.kind.video": "Video",
  "build.media.kind.other": "Other",

  "build.translations.none": "No translations available.",
  "build.translations.select": "Select language",
  "build.translations.add": "Add language",
  "build.translations.remove": "Remove language",
  "build.translations.title": "Title",
  "build.translations.title.placeholder": "Public title",
  "build.translations.description": "Description",
  "build.translations.description.placeholder": "Extended description",

  "build.events.list": "Events",
  "build.events.add": "Add event",
  "build.events.loading": "Loading events.",
  "build.events.empty": "No linked events.",
  "build.events.new": "(New event)",
  "build.events.delete": "Delete",
  "build.events.language": "Language",
  "build.events.era": "Era",
  "build.events.year_from": "Year from",
  "build.events.year_to": "Year to",
  "build.events.exact_date": "Exact date",
  "build.events.latitude": "Latitude",
  "build.events.longitude": "Longitude",
  "build.events.continent": "Continent",
  "build.events.country": "Country",
  "build.events.location": "Place",
  "build.events.map.expand": "Open large map",
  "build.events.map.close": "Close map",
  "build.events.title": "Title",
  "build.events.wikipedia": "Wikipedia URL",
  "build.events.description": "Description",
  "build.events.type": "Event type",
  "build.events.type.placeholder": "Select type",
  "build.events.related_journey": "Related journey",
  "build.events.add_relation": "Add correlation",
  "build.events.media.empty": "No media for the event.",
  "build.events.not_listed": "(not listed)",

  "build.messages.loading_details": "Loading journey details...",
  "build.messages.list_error": "Unable to load journeys.",
  "build.messages.related_events_error": "Error loading related events.",
  "build.messages.details_error": "Error loading details.",
  "build.messages.not_found": "Journey not found.",
  "build.messages.save_error": "Error saving journey.",
  "build.messages.events_save_error": "Error saving events.",
  "build.messages.metadata_required": "Fill slug and code to save the journey.",
  "build.messages.delete_error": "Error while deleting.",
  "build.messages.approval_error": "Error while requesting approval.",
  "build.messages.select_for_approval": "Select a journey to submit for approval.",
  "build.messages.approval_sent": "Request sent.",
  "build.messages.delete_confirm": "Delete the journey and its related events permanently?",
  "build.messages.delete_ok": "Journey deleted.",
  "build.messages.save_ok": "Created!",
  "build.messages.events_saved_prefix": "Events saved:",
  "build.messages.no_profile": "Profile not available",
};

const it: UIDictionary = {
  // APP / LOGO
  "app.title": "GeoHistory Journey",
  "topbar.logo.ariaLabel": "GeoHistory Journey",
  "topbar.motto": "Dove tempo e spazio diventano storie",

  // TOPBAR – pulsanti principali
  "topbar.home": "Home",
  "topbar.home.title": "Home",
  "topbar.back": "Indietro",
  "topbar.back.title": "Indietro",
  "topbar.settings": "Impostazioni",
  "topbar.settings.title": "Impostazioni",
  "topbar.guide": "Guida",
  "topbar.guide.title": "Guarda il video introduttivo",
  "topbar.guide.ariaLabel": "Guarda il video introduttivo",
  "topbar.logout": "Esci",
  "topbar.logout.title": "Esci",

  // VIDEO OVERLAY
  "video.close.ariaLabel": "Chiudi il video",
  "video.close.title": "Chiudi il video",
  "video.unsupported": "Il tuo browser non supporta il tag video.",
  "video.volume.label": "Controllo del volume",
  "video.playbackError":
    "Premi play o sblocca l'audio dal player per ascoltare il video.",

  // LANDING – welcome
  "landing.welcome.base": "Benvenuto su GeoHistory",
  "landing.welcome.text":
    "Viaggia tra secoli e continenti per scoprire come gli eventi umani hanno plasmato il nostro mondo. Scegli il tuo percorso: esplora per epoca, luogo o tema.",

  // LANDING – timeline block
  "landing.timeline.title": "Timeline Explorer",
  "landing.timeline.button": "Esplora le epoche",

  // LANDING – discover block
  "landing.discover.title": "Scopri",
  "landing.discover.card.most_rated.title": "Più votati",
  "landing.discover.card.most_rated.text":
    "I viaggi ed eventi con le valutazioni più alte.",
  "landing.discover.card.favourites.title": "Preferiti",
  "landing.discover.card.favourites.text": "I tuoi viaggi salvati.",
  "landing.discover.card.new_journeys.title": "Nuovi viaggi",
  "landing.discover.card.new_journeys.text":
    "Gli ultimi viaggi pubblicati dagli utenti.",
  "landing.discover.card.build_journey.title": "Crea un viaggio",
  "landing.discover.card.build_journey.text":
    "Crea o modifica il tuo viaggio multi-evento.",

  // LANDING – globe block
  "landing.globe.title": "Globe Explorer",
  "landing.globe.button": "Esplora i luoghi",

  // TIMELINE – header
  "timeline.header.title": "Timeline Explorer",
  "timeline.header.checking": "Verifica in corso…",
  "timeline.header.guest": "Ospite",
  "timeline.header.from": "Da",
  "timeline.header.to": "A",
  "timeline.header.show_all": "Mostra tutto",
  "timeline.header.show_all.title":
    "Azzera intervallo, ricerca testuale e filtro geografico",

  // TIMELINE – geo badge
  "timeline.geo.badge.label": "Filtro geografico",
  "timeline.geo.badge.clear": "Rimuovi filtro geo",
  "timeline.geo.badge.clear.title": "Rimuovi il filtro geografico",

  // TIMELINE – timeline bar
  "timeline.timeline.loading": "Caricamento timeline…",

  // TIMELINE – summary / search / no results
  "timeline.summary.initializing": "Inizializzazione…",
  "timeline.summary.loading": "Caricamento risultati…",
  "timeline.summary.in_range_prefix": "Nel periodo:",
  "timeline.summary.group_events": "journey",
  "timeline.summary.total_events_prefix": "eventi totali trovati",
  "timeline.search.label": "Ricerca testuale",
  "timeline.search.placeholder": "Digita per filtrare…",
  "timeline.search.clear": "Pulisci",
  "timeline.search.clear.title":
    "Pulisci il testo e mantieni solo l'intervallo temporale",
  "timeline.no_results":
    "Nessun journey trovato. Prova a modificare il timeframe o svuota la ricerca.",

  // FAVOURITES – generic messages
  "favourites.login_required":
    "Accedi per utilizzare la funzione Preferiti.",
  "favourites.toggle_error":
    "Impossibile aggiornare lo stato di preferito.",

  // SCORECARD – cover / immagini
  "scorecard.cover.missing": "Nessuna copertina",

  // SCORECARD – preferiti (stato)
  "scorecard.favourite.state.yes": "Nei tuoi preferiti",
  "scorecard.favourite.state.no": "Non nei preferiti",
  "scorecard.favourite.state.generic": "Stato preferito",

  // SCORECARD – preferiti (azioni)
  "scorecard.favourite.action.add": "Aggiungi ai preferiti",
  "scorecard.favourite.action.remove": "Rimuovi dai preferiti",

  // SCORECARD – data pubblicazione
  "scorecard.publication_date.title": "Data di pubblicazione",

  // SCORECARD – eventi
  "scorecard.events.count_title": "Numero di eventi",
  "scorecard.events.count_suffix": "eventi",

  // SCORECARD – arco temporale
  "scorecard.timespan.title": "Arco temporale",

  // SCORECARD – CTA
  "scorecard.cta.open": "Apri",

  // RATING STARS
  "rating.stars.rate_prefix": "Valuta",
  "rating.stars.login_required": "Accedi per votare",

  // RATING SUMMARY
  "rating.summary.no_ratings": "Nessuna valutazione",
  "rating.summary.votes": "voti",

  // JOURNEY – group_event detail
  "journey.loading": "Caricamento journey…",
  "journey.error": "Errore",
  "journey.back": "Indietro",
  "journey.title_fallback": "Journey",
  "journey.related_from.fallback": "Journey di provenienza",
  "journey.concurrent.none": "Nessun evento concomitante.",
  "journey.related.title": "Journey correlati",
  "journey.related.none": "Nessun collegamento.",
  "journey.related.open_button": "Apri journey",
  "journey.media.title": "Media del journey",
  "journey.media.none": "Nessun media del journey.",

  // GLOBE – footer
  "globe.footer.lat": "Lat:",
  "globe.footer.lon": "Lon:",
  "globe.footer.city_radius": "Raggio città (km):",
  "globe.footer.continent": "Continente:",
  "globe.footer.country": "Paese:",
  "globe.footer.nearest_city": "Città più vicina:",
  "globe.unknown": "Sconosciuto",

  // GENERIC
  "generic.loading": "Caricamento...",

  // BUILD JOURNEY
  "build.tab.journey": "Journey",
  "build.tab.events": "Eventi",
  "build.group.tab.general": "Generale",
  "build.group.tab.translations": "Traduzioni",
  "build.group.tab.media": "Media",
  "build.event.tab.when_where": "Quando e dove",
  "build.event.tab.translations": "Traduzioni",
  "build.event.tab.media": "Media",
  "build.event.tab.details": "Dettagli",

  "build.actions.new": "Nuovo",
  "build.actions.save": "Salva",
  "build.actions.save.loading": "Salvo...",
  "build.actions.approval": "Richiedi approvazione",
  "build.actions.approval.loading": "Invio...",
  "build.actions.delete": "Elimina",
  "build.actions.delete.loading": "Elimino...",
  "build.actions.edit": "Modifica",
  "build.actions.close": "Chiudi",
  "build.actions.show_journeys": "Mostra journeys",

  "build.sidebar.visibility": "Visibilità",
  "build.sidebar.filter.all": "Tutti",
  "build.sidebar.filter.public": "Pubblici",
  "build.sidebar.filter.private": "Privati",
  "build.sidebar.order": "Ordine",
  "build.sidebar.sort.last": "Ultimi approvati",
  "build.sidebar.sort.first": "Primi approvati",
  "build.sidebar.saved": "salvati",
  "build.sidebar.of": "di",
  "build.sidebar.saved_filtered": "salvati (filtrato)",
  "build.sidebar.loading": "Caricamento journeys.",
  "build.sidebar.empty": "Nessun journey salvato. Crea un nuovo flow.",
  "build.sidebar.no_match": "Nessun journey corrisponde al filtro attivo.",
  "build.sidebar.checking": "Verifico la sessione...",
  "build.sidebar.login": "Effettua il login per salvare i journeys.",
  "build.sidebar.profile": "Profilo:",

  "build.group.visibility": "Visibilità",
  "build.group.workflow": "Stato workflow",
  "build.group.audience": "Flag audience",
  "build.group.slug": "Slug",
  "build.group.slug.placeholder": "Es. age-of-exploration",
  "build.group.code": "Codice",
  "build.group.code.placeholder": "Es. EXP001",
  "build.group.owner": "Profilo proprietario",
  "build.group.created_at": "Creato il",
  "build.group.updated_at": "Aggiornato il",
  "build.group.approved_by": "Approvato da",
  "build.group.approved_at": "Approvato il",
  "build.group.requested_at": "Richiesta approvazione il",
  "build.group.refused_by": "Rifiutato da",
  "build.group.refused_at": "Rifiutato il",
  "build.group.refusal_reason": "Motivo del rifiuto",
  "build.group.refusal_reason.placeholder": "Spiega perché è stato rifiutato",
  "build.group.workflow.draft": "bozza",

  "build.audience.fan": "Consenti fan",
  "build.audience.stud_high": "Consenti stud superiori",
  "build.audience.stud_middle": "Consenti stud medie",
  "build.audience.stud_primary": "Consenti stud primaria",

  "build.media.filter_all": "Tutti",
  "build.media.add": "Aggiungi media",
  "build.media.filter_prefix": "Filtrati media di tipo:",
  "build.media.empty": "Nessun media collegato.",
  "build.media.order": "Ordine",
  "build.media.title": "Titolo",
  "build.media.title.placeholder": "Titolo asset",
  "build.media.type": "Tipo",
  "build.media.delete": "Elimina",
  "build.media.public_url": "URL pubblico",
  "build.media.source_url": "URL sorgente",
  "build.media.url.placeholder": "https://",
  "build.media.kind.image": "Immagine",
  "build.media.kind.video": "Video",
  "build.media.kind.other": "Altro",

  "build.translations.none": "Nessuna traduzione disponibile.",
  "build.translations.select": "Seleziona lingua",
  "build.translations.add": "Aggiungi lingua",
  "build.translations.remove": "Rimuovi lingua",
  "build.translations.title": "Titolo",
  "build.translations.title.placeholder": "Titolo pubblico",
  "build.translations.description": "Descrizione",
  "build.translations.description.placeholder": "Descrizione estesa",

  "build.events.list": "Eventi",
  "build.events.add": "Aggiungi evento",
  "build.events.loading": "Caricamento eventi.",
  "build.events.empty": "Nessun evento collegato.",
  "build.events.new": "(Nuovo evento)",
  "build.events.delete": "Elimina",
  "build.events.language": "Lingua",
  "build.events.era": "Era",
  "build.events.year_from": "Anno da",
  "build.events.year_to": "Anno a",
  "build.events.exact_date": "Data esatta",
  "build.events.latitude": "Latitudine",
  "build.events.longitude": "Longitudine",
  "build.events.continent": "Continente",
  "build.events.country": "Paese",
  "build.events.location": "Luogo",
  "build.events.map.expand": "Apri mappa grande",
  "build.events.map.close": "Chiudi mappa",
  "build.events.title": "Titolo",
  "build.events.wikipedia": "Wikipedia URL",
  "build.events.description": "Descrizione",
  "build.events.type": "Tipo evento",
  "build.events.type.placeholder": "Seleziona tipo",
  "build.events.related_journey": "Journey correlato",
  "build.events.add_relation": "Aggiungi correlazione",
  "build.events.media.empty": "Nessun media per l'evento.",
  "build.events.not_listed": "(non in elenco)",

  "build.messages.loading_details": "Caricamento dettagli del journey...",
  "build.messages.list_error": "Impossibile caricare i journeys.",
  "build.messages.related_events_error": "Errore nel caricamento degli eventi collegati.",
  "build.messages.details_error": "Errore durante il caricamento dei dettagli.",
  "build.messages.not_found": "Journey non trovato.",
  "build.messages.save_error": "Errore di salvataggio.",
  "build.messages.events_save_error": "Errore salvataggio eventi.",
  "build.messages.metadata_required": "Compila slug e codice per salvare il journey.",
  "build.messages.delete_error": "Errore durante l'eliminazione.",
  "build.messages.approval_error": "Errore durante la richiesta di approvazione.",
  "build.messages.select_for_approval": "Seleziona un journey da inviare in approvazione.",
  "build.messages.approval_sent": "Richiesta inviata.",
  "build.messages.delete_confirm": "Eliminare definitivamente il journey e gli eventi collegati?",
  "build.messages.delete_ok": "Journey eliminato.",
  "build.messages.save_ok": "Creato!",
  "build.messages.events_saved_prefix": "Eventi salvati:",
  "build.messages.no_profile": "Profilo non disponibile",
};

const uiDictionaries: Record<SupportedUILang, UIDictionary> = {
  en,
  it,
};

const FALLBACK_LANG: SupportedUILang = "en";

/**
 * Restituisce la stringa tradotta per la chiave data.
 * Se la chiave manca, mostra un avviso in console.
 */
export function tUI(langCode: string | null | undefined, key: string): string {
  const raw = (langCode ?? "").toLowerCase();
  const short = (raw.slice(0, 2) || FALLBACK_LANG) as SupportedUILang;

  const lang: SupportedUILang = short === "it" ? "it" : "en";

  const dict = uiDictionaries[lang];

  if (key in dict) return dict[key];

  const fallbackDict = uiDictionaries[FALLBACK_LANG];
  if (key in fallbackDict) {
    console.warn(
      `[i18n] Missing UI key "${key}" for lang "${lang}", using fallback "${FALLBACK_LANG}".`
    );
    return fallbackDict[key];
  }

  console.warn(
    `[i18n] Missing UI key "${key}" in ALL dictionaries. Add it to uiLabels.ts (en/it).`
  );
  return key;
}
