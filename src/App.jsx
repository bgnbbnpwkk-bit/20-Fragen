import { useState, useEffect, useRef, createContext, useContext } from "react";
import {
  onAuthStateChanged, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";

// ─── Zugriff nur für diese Google-Accounts ──────────────────────────────────
const ALLOWED_EMAILS = [
  "marc.saenger1975@gmail.com",
  "melaniechabane1975@gmail.com",
];

// Kontext, damit z. B. das i-Panel an User/Logout kommt (ohne Props durchzureichen)
const AuthContext = createContext({ user: null, onLogout: () => {} });

// ─── Firebase Realtime DB – REST API ────────────────────────────────────────
// Spiel-Sync läuft weiterhin über die REST-API. Falls die Security Rules Login
// verlangen, wird das ID-Token als ?auth=… mitgeschickt (bei offenen Rules egal).
const FIREBASE_URL = "https://unser-einkaufszettel-default-rtdb.europe-west1.firebasedatabase.app";

async function authQuery() {
  try {
    const token = await auth.currentUser?.getIdToken();
    return token ? `?auth=${token}` : "";
  } catch {
    return "";
  }
}

async function fbGet(path) {
  const res = await fetch(`${FIREBASE_URL}/${path}.json${await authQuery()}`);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Lesen fehlgeschlagen (HTTP ${res.status}) ${txt.slice(0, 140)}`);
  }
  return res.json();
}

async function fbSet(path, data) {
  const res = await fetch(`${FIREBASE_URL}/${path}.json${await authQuery()}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Speichern fehlgeschlagen (HTTP ${res.status}) ${txt.slice(0, 140)}`);
  }
  return res.json();
}

async function fbUpdate(path, data) {
  const res = await fetch(`${FIREBASE_URL}/${path}.json${await authQuery()}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Aktualisieren fehlgeschlagen (HTTP ${res.status}) ${txt.slice(0, 140)}`);
  }
  return res.json();
}

// ─── Begriff-Datenbank ──────────────────────────────────────────────────────
const BEGRIFFE = {
  "Personen": [
    "Albert Einstein", "Cleopatra", "Barack Obama", "Marie Curie", "Elvis Presley",
    "Leonardo da Vinci", "Angela Merkel", "Elon Musk", "Marilyn Monroe", "Napoleon Bonaparte",
    "Taylor Swift", "Michael Jackson", "Cristiano Ronaldo", "Frida Kahlo", "Beethoven",
    "Harry Potter", "Sherlock Holmes", "James Bond", "Hermione Granger", "Batman"
  ],
  "Tiere": [
    "Elefant", "Delfin", "Koalabär", "Flamingo", "Gepard",
    "Oktopus", "Faultier", "Schneeleopard", "Axolotl", "Mantarochen",
    "Gorilla", "Polarfuchs", "Chamäleon", "Qualle", "Nashornkäfer",
    "Pinguin", "Erdmännchen", "Flughund", "Seepferdchen", "Wolpertinger"
  ],
  "Orte": [
    "Eiffelturm", "Machu Picchu", "Sahara", "Antarktis", "Tokio",
    "Venedig", "Grand Canyon", "Neuschwanstein", "Amazonas", "Dubai",
    "Nordpol", "Vatikan", "Stonehenge", "Angkor Wat", "Niagara-Fälle",
    "Sizilien", "Island", "Maldiven", "Schwarzwald", "Ayers Rock"
  ],
  "Filme & Serien": [
    "Titanic", "Der König der Löwen", "Breaking Bad", "Inception", "Stranger Things",
    "Der Herr der Ringe", "Friends", "The Office", "Game of Thrones", "Interstellar",
    "Dirty Dancing", "Pretty Woman", "The Mandalorian", "Avatar", "Pulp Fiction",
    "Schindlers Liste", "La La Land", "Squid Game", "The Crown", "Forrest Gump"
  ],
  "Essen & Trinken": [
    "Sushi", "Tiramisu", "Döner Kebab", "Champagner", "Currywurst",
    "Croissant", "Guacamole", "Ramen", "Schwarzwälder Kirschtorte", "Hummus",
    "Taco", "Crème brûlée", "Bratwurst", "Matcha", "Baklava",
    "Fondue", "Paella", "Bubble Tea", "Pretzeln", "Kaiserschmarrn"
  ],
  "Dinge / Objekte": [
    "Kompass", "Teleskop", "Akkordeon", "Leuchtturm", "Heißluftballon",
    "Kaleidoskop", "Metronom", "Globus", "Sanduhr", "Fernrohr",
    "Schachbrett", "Laterne", "Stethoskop", "Boomerang", "Thermoskanne",
    "Drachen", "Kommode", "Ukulele", "Periskop", "Schatztruhe"
  ]
};

const KATEGORIEN = Object.keys(BEGRIFFE);

const KATEGORIE_ICONS = {
  "Personen": "👤",
  "Tiere": "🐾",
  "Orte": "🌍",
  "Filme & Serien": "🎬",
  "Essen & Trinken": "🍽️",
  "Dinge / Objekte": "📦"
};

// ─── Schnell-Tipp-Fragen je Kategorie ───────────────────────────────────────
const SCHNELLFRAGEN = {
  "Personen": [
    "Lebt die Person noch?", "Ist es ein Mann?", "Ist die Person berühmt?",
    "Ist es eine echte Person?", "Ist es ein/e Sportler/in?", "Ist es ein/e Musiker/in?"
  ],
  "Tiere": [
    "Lebt es an Land?", "Hat es vier Beine?", "Ist es ein Haustier?",
    "Kann es fliegen?", "Ist es größer als ein Hund?", "Lebt es im Wasser?"
  ],
  "Orte": [
    "Liegt es in Europa?", "Ist es eine Stadt?", "Kann man dort Urlaub machen?",
    "Ist es von Menschen gebaut?", "Ist es in Deutschland?", "Liegt es am Wasser?"
  ],
  "Filme & Serien": [
    "Ist es ein Film?", "Ist es eine Serie?", "Gibt es darin Action?",
    "Ist es eine Liebesgeschichte?", "Ist es Animation/Zeichentrick?", "Ist es von Disney?"
  ],
  "Essen & Trinken": [
    "Ist es süß?", "Kann man es trinken?", "Ist es warm?",
    "Kommt es aus Italien?", "Ist es eine Nachspeise?", "Isst man es mit der Hand?"
  ],
  "Dinge / Objekte": [
    "Ist es aus Metall?", "Passt es in eine Hand?", "Hat es mit Musik zu tun?",
    "Benutzt man es draußen?", "Ist es elektronisch?", "Findet man es zu Hause?"
  ]
};

// ─── Farb-Palette ────────────────────────────────────────────────────────────
const COLORS = {
  bg: "#0a0a12",
  surface: "#12121e",
  card: "#1a1a2e",
  border: "#2a2a4a",
  accent: "#e8c547",
  accentDim: "#b89d35",
  green: "#4ade80",
  red: "#f87171",
  blue: "#60a5fa",
  text: "#f0f0f8",
  muted: "#6b6b8a",
  marc: "#60a5fa",
  melli: "#f472b6",
};

// ─── Firebase Realtime Sync (Polling alle 800ms) ─────────────────────────────
function useGameState(roomId) {
  const [game, setGame] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const gameRef = useRef(null);

  useEffect(() => {
    if (!roomId) return;

    // Initialer Load
    fbGet(`games/${roomId}`).then(data => {
      if (data) {
        setGame(data);
        gameRef.current = data;
      }
      setConnected(true);
      setError(null);
    }).catch(e => {
      setConnected(false);
      setError(e.message);
    });

    // Polling alle 800ms
    const interval = setInterval(async () => {
      try {
        const data = await fbGet(`games/${roomId}`);
        setConnected(true);
        setError(null);
        if (data) {
          setGame(prev => {
            // Eigene, noch nicht bestätigte Änderungen NICHT durch veraltete
            // Server-Daten überschreiben (verhindert "verschwindende" Fragen).
            if ((data.rev || 0) < (gameRef.current?.rev || 0)) return prev;
            if (JSON.stringify(prev) !== JSON.stringify(data)) {
              gameRef.current = data;
              return data;
            }
            return prev;
          });
        }
      } catch (e) {
        setConnected(false);
        setError(e.message);
      }
    }, 800);

    return () => clearInterval(interval);
  }, [roomId]);

  const updateGame = async (newState) => {
    const base = typeof newState === "function" ? newState(gameRef.current) : newState;
    // Versions-Zähler hochzählen, damit veraltete Polls unsere Änderung nicht zurücksetzen
    const updated = { ...base, rev: (gameRef.current?.rev || 0) + 1 };
    gameRef.current = updated;
    setGame(updated);
    try {
      await fbSet(`games/${roomId}`, updated);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };

  return { game, updateGame, connected, error };
}

function createNewGame(kategorie, begriff, ratePlayer) {
  return {
    phase: "playing", // lobby | playing | guessing | result
    kategorie,
    begriff,
    ratePlayer, // "marc" | "melli"
    fragen: [],
    fragesRest: 20,
    geraten: null,
    richtig: null,
    punkte: { marc: 0, melli: 0 },
    runde: 1,
    createdAt: Date.now(),
  };
}

// ─── Auth-Gate (Login-Pflicht) ──────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    // Falls per Redirect angemeldet wurde, hier abschließen
    getRedirectResult(auth).catch(e => setAuthError(uebersetzeAuthFehler(e)));

    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        const email = (u.email || "").toLowerCase();
        if (ALLOWED_EMAILS.includes(email)) {
          setUser(u);
          setAuthError(null);
        } else {
          // Nicht freigeschalteter Account -> sofort abmelden
          signOut(auth);
          setUser(null);
          setAuthError(
            `Schade, der Account „${u.email}" ist nicht freigeschaltet. ` +
            `Diese App ist nur für Team Melli & Marc. 💙🩷`
          );
        }
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  async function login() {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/cancelled-popup-request"].includes(e.code)) {
        try { await signInWithRedirect(auth, googleProvider); return; }
        catch (e2) { setAuthError(uebersetzeAuthFehler(e2)); }
      } else if (e.code !== "auth/popup-closed-by-user") {
        setAuthError(uebersetzeAuthFehler(e));
      }
    } finally {
      setSigningIn(false);
    }
  }

  function logout() {
    signOut(auth);
  }

  if (authLoading) return <SplashScreen text="Einen Moment…" />;
  if (!user) return <LoginScreen onLogin={login} error={authError} signingIn={signingIn} />;

  return (
    <AuthContext.Provider value={{ user, onLogout: logout }}>
      <ZwanzigFragen />
    </AuthContext.Provider>
  );
}

function uebersetzeAuthFehler(e) {
  if (!e) return null;
  switch (e.code) {
    case "auth/unauthorized-domain":
      return "Diese Adresse ist in Firebase noch nicht freigegeben. Bitte die Domain bgnbbnpwkk-bit.github.io in den autorisierten Domains ergänzen.";
    case "auth/operation-not-allowed":
      return "Die Google-Anmeldung ist im Firebase-Projekt noch nicht aktiviert.";
    case "auth/network-request-failed":
      return "Netzwerkfehler – bitte Internetverbindung prüfen und erneut versuchen.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return null;
    default:
      return "Anmeldung fehlgeschlagen: " + (e.message || e.code || "Unbekannter Fehler");
  }
}

// ─── Login- & Splash-Screen ─────────────────────────────────────────────────
function SplashScreen({ text }) {
  return (
    <div style={styles.root}>
      <div style={styles.centerBox}>
        <span style={{ fontSize: 56 }}>❓</span>
        <p style={{ color: COLORS.muted, marginTop: 16 }}>{text}</p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.3-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12.5 24 12.5c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 43.5c5.4 0 10.3-2 14-5.3l-6.5-5.5c-2 1.5-4.6 2.3-7.5 2.3-5.2 0-9.6-3.3-11.2-8l-6.6 5.1C9.6 39 16.2 43.5 24 43.5z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.5 5.5c-.5.4 7-5 7-15 0-1.2-.1-2.3-.2-3.5z" />
    </svg>
  );
}

function LoginScreen({ onLogin, error, signingIn }) {
  return (
    <div style={styles.root}>
      <div style={styles.centerBox}>
        <div style={styles.logo}>
          <span style={{ fontSize: 56 }}>❓</span>
          <h1 style={styles.title}>20 Fragen</h1>
          <p style={styles.subtitle}>von Team Melli & Marc</p>
        </div>

        <p style={{ color: COLORS.muted, textAlign: "center", marginBottom: 24, lineHeight: 1.6 }}>
          Bitte melde dich an, um zu spielen.
        </p>

        <button
          style={{
            ...styles.btn, background: "#fff", color: "#1f1f1f", fontWeight: 700, width: "100%",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            opacity: signingIn ? 0.7 : 1,
          }}
          onClick={onLogin}
          disabled={signingIn}
        >
          <GoogleIcon /> {signingIn ? "Anmeldung läuft…" : "Mit Google anmelden"}
        </button>

        {error && (
          <div style={{
            marginTop: 16, color: COLORS.red, fontSize: 13, textAlign: "center", lineHeight: 1.5,
            background: "rgba(248,113,113,0.08)", border: `1px solid ${COLORS.red}`,
            borderRadius: 12, padding: "12px 14px",
          }}>
            {error}
          </div>
        )}

        <p style={{ color: COLORS.muted, fontSize: 11, textAlign: "center", marginTop: 24 }}>
          Nur für Marc &amp; Melli freigeschaltet 💙🩷
        </p>
      </div>
    </div>
  );
}

// ─── Hauptkomponente ─────────────────────────────────────────────────────────
function ZwanzigFragen() {
  const [screen, setScreen] = useState("start"); // start | join | lobby | game
  const [myRole, setMyRole] = useState(null); // "marc" | "melli"
  const [roomId, setRoomId] = useState("");
  const [inputRoom, setInputRoom] = useState("");
  const [selectedKat, setSelectedKat] = useState(null);
  const [currentBegriff, setCurrentBegriff] = useState(null);
  const [frageInput, setFrageInput] = useState("");
  const [rateInput, setRateInput] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [showBegriff, setShowBegriff] = useState(false);

  const { game, updateGame, connected, error } = useGameState(roomId);

  const amIRater = game && myRole === game.ratePlayer;
  const amIAnswerer = game && myRole !== game.ratePlayer;

  // ─── Neues Spiel starten ──────────────────────────────────────────────────
  function startGame() {
    if (!selectedKat) return;
    const liste = BEGRIFFE[selectedKat];
    const begriffGewählt = liste[Math.floor(Math.random() * liste.length)];
    setCurrentBegriff(begriffGewählt);
    const rater = myRole === "marc" ? "melli" : "marc";
    const prev = game;
    updateGame({
      ...createNewGame(selectedKat, begriffGewählt, rater),
      punkte: prev?.punkte || { marc: 0, melli: 0 },
      runde: (prev?.runde || 0) + 1,
    });
    setSelectedKat(null);
    setShowBegriff(true);
    setTimeout(() => setShowBegriff(false), 3000);
  }

  // ─── Frage stellen ────────────────────────────────────────────────────────
  function stelleFrageText(text) {
    const t = (text || "").trim();
    if (!t || !game) return;
    // Firebase speichert leere Arrays nicht -> game.fragen kann undefined sein
    const newFragen = [...(game.fragen || []), { frage: t, antwort: null }];
    updateGame({ ...game, fragen: newFragen });
    setFrageInput("");
  }
  function stelleFrage() {
    stelleFrageText(frageInput);
  }

  // ─── Antwort geben ────────────────────────────────────────────────────────
  function gebeAntwort(idx, antwort) {
    const newFragen = (game.fragen || []).map((f, i) =>
      i === idx ? { ...f, antwort } : f
    );
    const beantwortet = newFragen.filter(f => f.antwort).length;
    updateGame({
      ...game,
      fragen: newFragen,
      fragesRest: 20 - beantwortet,
    });
  }

  // ─── Raten ────────────────────────────────────────────────────────────────
  function rateBegriff() {
    if (!rateInput.trim()) return;
    const richtig = rateInput.trim().toLowerCase() === game.begriff.toLowerCase();
    const newPunkte = { ...game.punkte };
    if (richtig) newPunkte[myRole] = (newPunkte[myRole] || 0) + 1;
    updateGame({
      ...game,
      phase: "result",
      geraten: rateInput.trim(),
      richtig,
      punkte: newPunkte,
    });
    setRateInput("");
  }

  // ─── Aufgeben ─────────────────────────────────────────────────────────────
  function aufgeben() {
    updateGame({ ...game, phase: "result", geraten: null, richtig: false });
  }

  // ─── Raum erstellen ───────────────────────────────────────────────────────
  async function createRoom(role) {
    const id = Math.random().toString(36).slice(2, 7).toUpperCase();
    const initialState = {
      phase: "lobby",
      punkte: { marc: 0, melli: 0 },
      runde: 0,
      players: { [role]: true },
    };
    try {
      await fbSet(`games/${id}`, initialState);
    } catch (e) {
      alert("Raum konnte nicht erstellt werden.\n\n" + e.message +
        "\n\nMeist liegt das an den Firebase-Datenbank-Regeln (Schreibzugriff gesperrt).");
      return;
    }
    setRoomId(id);
    setMyRole(role);
    setScreen("lobby");
  }

  async function joinRoom(role) {
    if (!inputRoom.trim()) return;
    const id = inputRoom.trim().toUpperCase();
    let existing;
    try {
      existing = await fbGet(`games/${id}`);
    } catch (e) {
      alert("Verbindung zur Datenbank fehlgeschlagen.\n\n" + e.message +
        "\n\nMeist liegt das an den Firebase-Datenbank-Regeln (Lesezugriff gesperrt).");
      return;
    }
    if (!existing) { alert("Raum nicht gefunden! Bitte Code prüfen."); return; }
    setRoomId(id);
    setMyRole(role);
    try {
      await fbUpdate(`games/${id}`, { players: { ...existing.players, [role]: true } });
    } catch (e) {
      alert("Beitreten fehlgeschlagen.\n\n" + e.message);
      return;
    }
    setScreen("game");
  }

  // ─── UI Helper ───────────────────────────────────────────────────────────
  const roleColor = (r) => r === "marc" ? COLORS.marc : COLORS.melli;
  const roleName = (r) => r === "marc" ? "Marc" : "Melli";

  // "unbeantwortet" über !f.antwort prüfen: Firebase verwirft null -> antwort
  // kann beim Auslesen undefined sein (=== null würde dann nicht greifen)
  const offeneFragen = (game?.fragen || []).filter(f => !f.antwort);
  const beantwortete = (game?.fragen || []).filter(f => f.antwort);

  // ─── Screens ─────────────────────────────────────────────────────────────
  if (screen === "start") return (
    <div style={styles.root}>
      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
      <button style={styles.infoBtn} onClick={() => setInfoOpen(true)}>i</button>

      <div style={styles.centerBox}>
        <div style={styles.logo}>
          <span style={{ fontSize: 56 }}>❓</span>
          <h1 style={styles.title}>20 Fragen</h1>
          <p style={styles.subtitle}>von Team Melli & Marc</p>
        </div>

        <p style={{ color: COLORS.muted, textAlign: "center", marginBottom: 32, lineHeight: 1.6 }}>
          Einer denkt, einer fragt.<br />Wer braucht weniger Fragen?
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <p style={{ color: COLORS.muted, fontSize: 13, textAlign: "center", marginBottom: 4 }}>
            Ich bin...
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button style={{ ...styles.btn, flex: 1, background: COLORS.marc, color: "#fff" }}
              onClick={() => { setMyRole("marc"); setScreen("join"); }}>
              Marc
            </button>
            <button style={{ ...styles.btn, flex: 1, background: COLORS.melli, color: "#fff" }}
              onClick={() => { setMyRole("melli"); setScreen("join"); }}>
              Melli
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (screen === "join") return (
    <div style={styles.root}>
      <button style={styles.backBtn} onClick={() => setScreen("start")}>← Zurück</button>
      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
      <button style={styles.infoBtn} onClick={() => setInfoOpen(true)}>i</button>

      <div style={styles.centerBox}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>👋</div>
          <h2 style={{ color: COLORS.text, margin: 0 }}>Hallo, <span style={{ color: roleColor(myRole) }}>{roleName(myRole)}</span>!</h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
          <button style={{ ...styles.btn, background: COLORS.accent, color: "#000", fontWeight: 700 }}
            onClick={() => createRoom(myRole)}>
            🎮 Neuen Raum erstellen
          </button>

          <div style={{ textAlign: "center", color: COLORS.muted, fontSize: 13 }}>— oder —</div>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={styles.input}
              placeholder="Raum-Code eingeben"
              value={inputRoom}
              onChange={e => setInputRoom(e.target.value.toUpperCase())}
              maxLength={5}
            />
            <button style={{ ...styles.btn, padding: "0 20px", background: COLORS.green, color: "#000" }}
              onClick={() => joinRoom(myRole)}>
              Beitreten
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (screen === "lobby") return (
    <div style={styles.root}>
      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
      <button style={styles.infoBtn} onClick={() => setInfoOpen(true)}>i</button>

      <div style={styles.centerBox}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40 }}>🔗</div>
          <h2 style={{ color: COLORS.text }}>Raum erstellt!</h2>
          <div style={styles.roomCode}>{roomId}</div>
          <p style={{ color: COLORS.muted, fontSize: 14 }}>
            Teile diesen Code mit {myRole === "marc" ? "Melli" : "Marc"}
          </p>
        </div>

        <button style={{ ...styles.btn, background: COLORS.accent, color: "#000", fontWeight: 700, width: "100%" }}
          onClick={() => setScreen("game")}>
          Spiel starten →
        </button>
      </div>
    </div>
  );

  // ─── Haupt-Spiel-Screen ───────────────────────────────────────────────────
  if (screen === "game") {
    // Phase: Kategorie wählen (Antworter wählt)
    if (!game || game.phase === "lobby") {

      return (
        <div style={styles.root}>
          <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
          <button style={styles.infoBtn} onClick={() => setInfoOpen(true)}>i</button>

          <div style={styles.header}>
            <ScoreBoard game={game} myRole={myRole} />
          </div>

          <div style={styles.centerBox}>
            <h2 style={{ color: COLORS.text, textAlign: "center" }}>
              {myRole === "marc" ? "Marc" : "Melli"}, wähle eine Kategorie
            </h2>
            <p style={{ color: COLORS.muted, textAlign: "center", fontSize: 13, marginBottom: 24 }}>
              Die andere Person rät den zufälligen Begriff daraus
            </p>

            <div style={styles.katGrid}>
              {KATEGORIEN.map(k => (
                <button
                  key={k}
                  style={{
                    ...styles.katBtn,
                    border: selectedKat === k
                      ? `2px solid ${COLORS.accent}`
                      : `2px solid ${COLORS.border}`,
                    background: selectedKat === k ? "rgba(232,197,71,0.1)" : COLORS.card,
                  }}
                  onClick={() => setSelectedKat(k)}
                >
                  <span style={{ fontSize: 28 }}>{KATEGORIE_ICONS[k]}</span>
                  <span style={{ fontSize: 13, color: COLORS.text }}>{k}</span>
                </button>
              ))}
            </div>

            {selectedKat && (
              <button style={{ ...styles.btn, background: COLORS.accent, color: "#000", fontWeight: 700, width: "100%", marginTop: 20 }}
                onClick={startGame}>
                Begriff auswählen & spielen →
              </button>
            )}
          </div>
        </div>
      );
    }

    // Phase: Ergebnis
    if (game.phase === "result") {
      const winner = game.richtig ? game.ratePlayer : (game.ratePlayer === "marc" ? "melli" : "marc");
      return (
        <div style={styles.root}>
          <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
          <button style={styles.infoBtn} onClick={() => setInfoOpen(true)}>i</button>

          <div style={styles.centerBox}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 64, marginBottom: 12 }}>
                {game.richtig ? "🎉" : "😅"}
              </div>
              <h2 style={{ color: game.richtig ? COLORS.green : COLORS.red, margin: 0 }}>
                {game.richtig ? "Richtig!" : "Leider falsch!"}
              </h2>
              {game.geraten && (
                <p style={{ color: COLORS.muted }}>Geraten: „{game.geraten}"</p>
              )}
              <div style={styles.auflösung}>
                <p style={{ color: COLORS.muted, fontSize: 13, margin: 0 }}>Der Begriff war</p>
                <p style={{ color: COLORS.accent, fontSize: 28, fontWeight: 700, margin: "4px 0 0" }}>{game.begriff}</p>
                <p style={{ color: COLORS.muted, fontSize: 12 }}>({game.kategorie})</p>
              </div>

              <ScoreBoard game={game} myRole={myRole} big />

              <p style={{ color: COLORS.muted, fontSize: 13, marginTop: 16 }}>
                Nächste Runde: <span style={{ color: roleColor(game.ratePlayer === "marc" ? "melli" : "marc") }}>
                  {roleName(game.ratePlayer === "marc" ? "melli" : "marc")}
                </span> denkt sich einen Begriff aus
              </p>

              {/* Nur der Gewinner der letzten Runde (= Antworter bei Richtig, oder Antworter bei Falsch) darf die nächste starten */}
              <button style={{ ...styles.btn, background: COLORS.accent, color: "#000", fontWeight: 700, marginTop: 20, width: "100%" }}
                onClick={() => updateGame({ ...game, phase: "lobby" })}>
                Nächste Runde →
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Phase: Spielen
    return (
      <div style={styles.root}>
        <ConnBanner error={error} />
        <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
        <button style={styles.infoBtn} onClick={() => setInfoOpen(true)}>i</button>

        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ color: COLORS.muted, fontSize: 12 }}>Runde {game.runde}</span>
              <div style={{ color: COLORS.text, fontWeight: 700 }}>
                {KATEGORIE_ICONS[game.kategorie]} {game.kategorie}
              </div>
            </div>
            <div style={styles.fragezähler}>
              <span style={{ color: game.fragesRest <= 5 ? COLORS.red : COLORS.accent, fontWeight: 700, fontSize: 20 }}>
                {game.fragesRest}
              </span>
              <span style={{ color: COLORS.muted, fontSize: 11 }}>Fragen</span>
            </div>
          </div>
          <ScoreBoard game={game} myRole={myRole} />
        </div>

        <div style={styles.scrollArea}>
          {/* Rolle-Anzeige */}
          <div style={{
            ...styles.roleBadge,
            background: amIRater ? "rgba(96,165,250,0.1)" : "rgba(244,114,182,0.1)",
            border: `1px solid ${amIRater ? COLORS.blue : COLORS.melli}`,
          }}>
            {amIRater ? "🔍 Du fragst & rätst" : "🤫 Du weißt den Begriff"}
          </div>

          {/* Begriff für Antworter */}
          {amIAnswerer && (
            <div style={styles.begriffCard}>
              <p style={{ color: COLORS.muted, fontSize: 12, margin: "0 0 4px" }}>Dein Begriff</p>
              <p style={{ color: COLORS.accent, fontSize: 22, fontWeight: 700, margin: 0 }}>{game.begriff}</p>
              <p style={{ color: COLORS.muted, fontSize: 11, margin: "4px 0 0" }}>Nur du siehst das!</p>
            </div>
          )}

          {/* Offene Fragen (warten auf Antwort) */}
          {offeneFragen.length > 0 && amIAnswerer && (
            <div style={styles.section}>
              <p style={styles.sectionTitle}>Offene Fragen ({offeneFragen.length})</p>
              {(game.fragen || []).map((f, i) => !f.antwort && (
                <div key={i} style={styles.frageCard}>
                  <p style={{ color: COLORS.text, margin: "0 0 10px" }}>„{f.frage}"</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={{ ...styles.btn, flex: 1, background: COLORS.green, color: "#000", padding: "8px" }}
                      onClick={() => gebeAntwort(i, "ja")}>✓ Ja</button>
                    <button style={{ ...styles.btn, flex: 1, background: COLORS.red, color: "#fff", padding: "8px" }}
                      onClick={() => gebeAntwort(i, "nein")}>✗ Nein</button>
                    <button style={{ ...styles.btn, flex: 1, background: COLORS.border, color: COLORS.text, padding: "8px" }}
                      onClick={() => gebeAntwort(i, "manchmal")}>~ Manchmal</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {offeneFragen.length > 0 && amIRater && (
            <div style={styles.section}>
              <p style={styles.sectionTitle}>Deine gestellte Frage</p>
              {offeneFragen.map((f, i) => (
                <div key={i} style={styles.frageCard}>
                  <p style={{ color: COLORS.text, margin: "0 0 6px" }}>„{f.frage}"</p>
                  <p style={{ color: COLORS.muted, fontSize: 12, margin: 0 }}>
                    ⏳ Wartet auf Antwort von {roleName(game.ratePlayer === "marc" ? "melli" : "marc")}…
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Bisherige Fragen & Antworten */}
          {beantwortete.length > 0 && (
            <div style={styles.section}>
              <p style={styles.sectionTitle}>Bisherige Antworten</p>
              {[...beantwortete].reverse().map((f, i) => (
                <div key={i} style={styles.antwortRow}>
                  <span style={{ color: COLORS.muted, fontSize: 13, flex: 1 }}>{f.frage}</span>
                  <span style={{
                    color: f.antwort === "ja" ? COLORS.green : f.antwort === "nein" ? COLORS.red : COLORS.accent,
                    fontWeight: 700, fontSize: 13, textTransform: "uppercase"
                  }}>{f.antwort}</span>
                </div>
              ))}
            </div>
          )}

          {/* Frage eingeben (Rater) */}
          {amIRater && game.fragesRest > 0 && offeneFragen.length === 0 && (
            <div style={styles.section}>
              <p style={styles.sectionTitle}>Deine Frage</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...styles.input, flex: 1 }}
                  placeholder="Eigene Frage eintippen…"
                  value={frageInput}
                  onChange={e => setFrageInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && stelleFrage()}
                />
                <button style={{ ...styles.btn, padding: "0 16px", background: COLORS.blue, color: "#fff" }}
                  onClick={stelleFrage}>
                  →
                </button>
              </div>
              <p style={{ color: COLORS.muted, fontSize: 11, margin: "4px 0 0" }}>
                Tippe eine eigene Frage – oder wähle einen Vorschlag:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(SCHNELLFRAGEN[game.kategorie] || []).map(q => (
                  <button
                    key={q}
                    style={styles.quickChip}
                    onClick={() => stelleFrageText(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Raten-Bereich */}
          {amIRater && (
            <div style={styles.section}>
              <p style={styles.sectionTitle}>Begriff raten</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...styles.input, flex: 1 }}
                  placeholder="Dein Lösungswort..."
                  value={rateInput}
                  onChange={e => setRateInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && rateBegriff()}
                />
                <button style={{ ...styles.btn, padding: "0 16px", background: COLORS.accent, color: "#000", fontWeight: 700 }}
                  onClick={rateBegriff}>
                  ✓
                </button>
              </div>
              <button style={{ ...styles.btn, width: "100%", marginTop: 8, background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.muted }}
                onClick={aufgeben}>
                Aufgeben
              </button>
            </div>
          )}

          {/* Keine Fragen mehr */}
          {game.fragesRest === 0 && amIRater && offeneFragen.length === 0 && (
            <div style={{ textAlign: "center", padding: 16 }}>
              <p style={{ color: COLORS.red }}>Keine Fragen mehr!</p>
              <p style={{ color: COLORS.muted, fontSize: 13 }}>Du musst jetzt raten.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ─── Verbindungs-Banner ──────────────────────────────────────────────────────
function ConnBanner({ error }) {
  if (!error) return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 300,
      background: COLORS.red, color: "#fff", fontSize: 12,
      padding: "8px 44px 8px 12px", textAlign: "center", lineHeight: 1.4,
    }}>
      ⚠️ Keine Verbindung zur Datenbank — {error}
    </div>
  );
}

// ─── Score Board ─────────────────────────────────────────────────────────────
function ScoreBoard({ game, myRole, big }) {
  if (!game) return null;
  return (
    <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: big ? 24 : 8 }}>
      {["marc", "melli"].map(r => (
        <div key={r} style={{
          textAlign: "center",
          padding: big ? "12px 24px" : "6px 16px",
          borderRadius: 12,
          background: r === myRole ? "rgba(255,255,255,0.05)" : "transparent",
          border: r === myRole ? `1px solid ${r === "marc" ? COLORS.marc : COLORS.melli}` : "none",
        }}>
          <div style={{ color: r === "marc" ? COLORS.marc : COLORS.melli, fontWeight: 700, fontSize: big ? 28 : 18 }}>
            {game.punkte?.[r] || 0}
          </div>
          <div style={{ color: COLORS.muted, fontSize: 11 }}>{r === "marc" ? "Marc" : "Melli"}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Info Modal ───────────────────────────────────────────────────────────────
function InfoModal({ open, onClose }) {
  const { user, onLogout } = useContext(AuthContext);
  if (!open) return null;
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ color: COLORS.accent, margin: "0 0 16px" }}>ℹ️ 20 Fragen</h3>

        <p style={{ color: COLORS.muted, fontSize: 13, marginBottom: 16 }}>
          Ein Spiel von Team Melli & Marc 💙🩷
        </p>

        <h4 style={{ color: COLORS.text, margin: "0 0 8px" }}>Features</h4>
        <ul style={{ color: COLORS.muted, fontSize: 13, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Echtzeit-Multiplayer (Raum-Code teilen)</li>
          <li>6 Kategorien mit je 20 Begriffen</li>
          <li>Eigene Fragen frei formulieren</li>
          <li>Ja / Nein / Manchmal Antworten</li>
          <li>Punktestand über mehrere Runden</li>
          <li>Maximal 20 Fragen pro Runde</li>
        </ul>

        <h4 style={{ color: COLORS.text, margin: "16px 0 8px" }}>Changelog</h4>
        <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.8 }}>
          <div><span style={{ color: COLORS.accent }}>v1.1.0</span> – Google-Login (nur Marc &amp; Melli), Abmelden im i-Panel</div>
          <div><span style={{ color: COLORS.accent }}>v1.0.6</span> – Bugfix: Antworter sieht jetzt die Ja/Nein/Manchmal-Knöpfe</div>
          <div><span style={{ color: COLORS.accent }}>v1.0.5</span> – Bugfix: Fragen lassen sich jetzt stellen (leeres-Array-Problem in Firebase behoben)</div>
          <div><span style={{ color: COLORS.accent }}>v1.0.4</span> – Gestellte Frage wird dem Frager angezeigt</div>
          <div><span style={{ color: COLORS.accent }}>v1.0.3</span> – Schnell-Tipp-Fragen je Kategorie (ein Tipp = abgeschickt)</div>
          <div><span style={{ color: COLORS.accent }}>v1.0.2</span> – Frage-Button repariert (keine verschwindenden Fragen mehr), eigene Fragen frei eingebbar</div>
          <div><span style={{ color: COLORS.accent }}>v1.0.1</span> – Klare Fehlermeldungen bei Verbindungsproblemen</div>
          <div><span style={{ color: COLORS.accent }}>v1.0.0</span> – Erste Version: Kategorien, Fragen, Punktestand</div>
        </div>

        <h4 style={{ color: COLORS.text, margin: "16px 0 8px" }}>Tech-Stack</h4>
        <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.8 }}>
          React · Firebase Auth (Google) · Firebase Realtime DB · GitHub Pages
        </div>

        {user && (
          <>
            <h4 style={{ color: COLORS.text, margin: "16px 0 8px" }}>Account</h4>
            <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.6 }}>
              Angemeldet als <span style={{ color: COLORS.text }}>{user.email}</span>
            </div>
            <button
              style={{ ...styles.btn, width: "100%", marginTop: 12, background: "transparent", border: `1px solid ${COLORS.red}`, color: COLORS.red }}
              onClick={() => { onClose(); onLogout(); }}
            >
              Abmelden
            </button>
          </>
        )}

        <button style={{ ...styles.btn, width: "100%", marginTop: 12, background: COLORS.accent, color: "#000" }}
          onClick={onClose}>Schließen</button>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  root: {
    minHeight: "100vh",
    background: COLORS.bg,
    fontFamily: "'Georgia', 'Times New Roman', serif",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    maxWidth: 480,
    margin: "0 auto",
  },
  centerBox: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 24px 48px",
    width: "100%",
    boxSizing: "border-box",
  },
  logo: {
    textAlign: "center",
    marginBottom: 24,
  },
  title: {
    color: COLORS.text,
    fontSize: 36,
    margin: "8px 0 4px",
    fontWeight: 700,
    letterSpacing: "-1px",
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 14,
    margin: 0,
  },
  header: {
    padding: "16px 20px",
    background: COLORS.surface,
    borderBottom: `1px solid ${COLORS.border}`,
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 20px 100px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  btn: {
    padding: "14px 20px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    fontSize: 15,
    fontFamily: "inherit",
    transition: "opacity 0.15s",
  },
  input: {
    padding: "12px 16px",
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.card,
    color: COLORS.text,
    fontSize: 15,
    fontFamily: "inherit",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  infoBtn: {
    position: "fixed",
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: `1px solid ${COLORS.border}`,
    background: COLORS.card,
    color: COLORS.muted,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
    zIndex: 100,
  },
  backBtn: {
    position: "absolute",
    top: 16,
    left: 16,
    background: "transparent",
    border: "none",
    color: COLORS.muted,
    cursor: "pointer",
    fontSize: 14,
    fontFamily: "inherit",
  },
  roomCode: {
    fontSize: 40,
    fontWeight: 700,
    color: COLORS.accent,
    letterSpacing: 8,
    padding: "16px 24px",
    background: COLORS.card,
    borderRadius: 16,
    border: `2px solid ${COLORS.border}`,
    margin: "16px 0",
    fontFamily: "monospace",
  },
  katGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    width: "100%",
  },
  katBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: "16px 12px",
    borderRadius: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.15s",
  },
  fragezähler: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    background: COLORS.card,
    padding: "8px 16px",
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
  },
  roleBadge: {
    textAlign: "center",
    padding: "10px 16px",
    borderRadius: 12,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 600,
  },
  begriffCard: {
    background: "rgba(232,197,71,0.08)",
    border: `1px solid ${COLORS.accentDim}`,
    borderRadius: 14,
    padding: "16px",
    textAlign: "center",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  sectionTitle: {
    color: COLORS.muted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    margin: "0 0 4px",
  },
  frageCard: {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 14,
    padding: "14px",
  },
  quickChip: {
    padding: "8px 12px",
    borderRadius: 999,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.card,
    color: COLORS.text,
    fontSize: 13,
    fontFamily: "inherit",
    cursor: "pointer",
  },
  antwortRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 12px",
    background: COLORS.card,
    borderRadius: 10,
    gap: 8,
  },
  auflösung: {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 14,
    padding: "16px",
    margin: "20px 0 0",
    textAlign: "center",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 200,
    padding: 20,
  },
  modal: {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 440,
    maxHeight: "80vh",
    overflowY: "auto",
  },
};
