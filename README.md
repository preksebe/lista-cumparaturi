# Lista de cumpărături

Listă comună, fără cont și fără parolă. Fiecare își scrie numele o dată (rămâne pe telefonul lui),
iar lângă fiecare produs apare cine l-a adăugat. Cantitatea se schimbă cu + și −, numele se modifică direct
în listă, iar ce s-a luat se bifează. Modificările apar pe loc pe toate telefoanele.

- Pagină statică (`index.html`, `style.css`, `app.js`), găzduită pe Vercel.
- Datele stau în Supabase, în tabelul `shopping_items` (`supabase/schema.sql`, `supabase/poze.sql`, apoi `supabase/retete.sql`, se rulează o dată).
- Pozele (micșorate în browser la maximum 1200 px, WebP) stau în bucket-ul `lista-poze` din Supabase Storage.
- În browser e doar cheia publică (publishable). Regulile din baza de date îi permit să lucreze
  doar cu tabelul listei și cu bucket-ul ei de poze.

Fără logare, oricine are linkul poate adăuga, modifica sau șterge. E ales intenționat.

## Rețete

Fila „Rețete” arată rețetele comune, salvate pentru o porție. Alegi porțiile, iar „Adaugă în listă” pune
ingredientele pe listă. Mărimea pachetului se ține pe ingredient (tabelul `package_sizes`): pachete = gramajul
total împărțit la pachet, rotunjit în sus. Dacă ingredientul e deja pe listă și nebifat, se adună la el.
Rețetele noi se introduc direct în baza de date (exemplu la finalul fișierului `supabase/retete.sql`).

## Comentarii

Butonul cu balon de la fiecare produs deschide pe loc un fir de comentarii (`item_comments`, `supabase/comentarii.sql`).
Insigna roșie arată comentariile noi scrise de altcineva și nevăzute pe acest dispozitiv („văzut” se ține în localStorage);
cea gri arată câte comentarii are produsul. Ștergerea produsului îi șterge și comentariile.
