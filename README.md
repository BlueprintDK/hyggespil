# Hyggespil – web-udgave

Danske selskabsspil (quiz, gåder, lege og udfordringer), der kan spilles i enhver browser på iPhone, Android, tablet og pc.

**Spil her:** https://blueprintdk.github.io/hyggespil/

## Ophav

Bygget på [Hyggespil](https://github.com/allanpersson/hyggespil) af **Allan Persson**, udgivet under MIT-licensen (se `LICENSE`). Alle spil og spørgsmål er hans arbejde. Støt gerne det originale projekt.

## Forskelle fra originalen

- Kører uden Home Assistant. Siden er en almindelig hjemmeside på GitHub Pages.
- **📱 Spil fra hver sin telefon** går via PeerJS (WebRTC) i stedet for Home Assistant. Værtens telefon holder rummet, og de andre deltager med en firecifret kode. Det rigtige svar og de private kort bliver på værtens telefon, indtil runden afsløres.
- 🔞-sektionen er fjernet helt (spil, knap, kode og tekster).
- Funktioner, der kræver Home Assistant (lys der pulserer, oplæsning gennem HA-højttalere, "Hør og gæt" via Music Assistant), virker ikke her.

## Læg den på hjemmeskærmen

- **iPhone (Safari):** Del → Føj til hjemmeskærm
- **Android (Chrome):** ⋮ → Føj til startskærm / Installer app
