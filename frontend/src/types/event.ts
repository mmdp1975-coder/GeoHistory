// Tipi minimi per compatibilità con il codice corrente (campi opzionali)
export interface GeoEvent {
  id?: string | number | null;
  event?: string;
  event_it?: string;
  event_en?: string;

  group_event?: string;
  group_event_it?: string;
  group_event_en?: string;

  description?: string;
  description_it?: string;
  description_en?: string;

  wikipedia?: string;
  wikipedia_it?: string;
  wikipedia_en?: string;

  type_event?: string;
  type?: string;
  event_type?: string;

  latitude?: number | string | null;
  longitude?: number | string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  lon?: number | string | null;

  continent?: string;
  country?: string;
  location?: string;

  year?: number;
  year_start?: number;
  year_end?: number;
  start_year?: number;
  end_year?: number;
  from_year?: number;
  to_year?: number;
}
