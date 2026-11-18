# Lista de cumpărături

Listă comună, fără cont și fără parolă. Fiecare își scrie numele o dată (rămâne pe telefonul lui),
iar lângă fiecare produs apare cine l-a adăugat. Cantitatea se schimbă cu + și −, numele se modifică direct
în listă, iar ce s-a luat se bifează. Modificările apar pe loc pe toate telefoanele.

- Pagină statică (`index.html`, `style.css`, `app.js`), găzduită pe Vercel.
- Datele stau în Supabase, în tabelul `shopping_items` (`supabase/schema.sql`, se rulează o dată).
- În browser e doar cheia publică (publishable). Regulile din baza de date îi permit să lucreze
  doar cu tabelul listei.

Fără logare, oricine are linkul poate adăuga, modifica sau șterge. E ales intenționat.
