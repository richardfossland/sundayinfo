// Tekster for storskjerm-mappa (bokmål). Lokal i mappa så den kan kopieres
// til andre Sunday-apper uten å dra med seg appens locale-fil.
export const tekst = {
  knapp: "Vis på storskjerm",
  tittel: "Vis på storskjerm",
  intro: "Skjermen kobles til med en kode: åpne skjerm-adressen i en nettleser på TV-en (eller en PC/Mac koblet til TV-en), og tast koden inn under «Koble til ny skjerm».",
  urlLabel: "Skjerm-adresse (åpnes på TV-en)",
  kopier: "Kopier",
  kopiert: "Kopiert",
  kopierFeilet: "Kunne ikke kopiere – merk adressen og kopier selv.",
  lukk: "Lukk",
  anbefalt: "Anbefalt for din enhet",
  direkte: {
    tittel: "TV eller PC med nettleser (enklest)",
    steg1: "Åpne adressen over i nettleseren på TV-en, eller på en PC/Mac koblet til TV-en med HDMI.",
    steg2: "Skjermen viser en kode på seks tegn. Tast den inn under «Koble til ny skjerm» her.",
    steg3: "Trykk F for fullskjerm. Skjermen husker seg selv og starter alene etter strømbrudd.",
  },
  eget: {
    tittel: "Chromecast / Apple TV: åpne skjermen i eget vindu",
    hjelp: "Åpner /skjerm i et eget vindu på denne maskinen. Send vinduet til TV-en (se under), og tast koden som vises inn under «Koble til ny skjerm». Vinduet må stå åpent så lenge det skal vises.",
    knapp: "Åpne skjermen i eget vindu",
    flyttet: "Skjermen ble flyttet til den andre skjermen. Trykk F for fullskjerm.",
    flyttHint: "Dra vinduet til TV-en eller projektoren og trykk F for fullskjerm.",
    blokkert: "Nettleseren blokkerte det nye vinduet. Tillat popup-vinduer for denne siden og prøv igjen.",
  },
  chromecast: {
    tittel: "Chromecast / Google TV",
    steg1: "Åpne skjermen i eget vindu og koble den med koden (se over).",
    steg2: "I Chrome-menyen ⋮ velger du «Cast …» (Lagre og del → Cast), og velger «Cast fane».",
    steg3: "Velg TV-en i listen. Trykk F i skjerm-vinduet for fullskjerm.",
    ikkeChromium: "Dette krever Chrome eller Edge på PC eller Chromebook. Åpne siden i en av dem for å caste.",
  },
  apple: {
    tittel: "Apple TV (AirPlay)",
    mac1: "Mac: åpne Kontrollsenter → Skjermspeiling og velg Apple TV.",
    mac2: "Velg «Bruk som separat skjerm».",
    mac3: "Åpne skjermen i eget vindu (knappen over), koble den med koden og dra vinduet over til Apple TV-en. Trykk F for fullskjerm.",
    ios1: "iPad/iPhone: åpne skjerm-adressen i Safari og koble den med koden.",
    ios2: "Åpne Kontrollsenter → Skjermspeiling og velg Apple TV.",
  },
} as const;
