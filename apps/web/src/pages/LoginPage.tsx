import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Button } from "../components/Button";
import { ApiError } from "../lib/api";

export function LoginPage() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Identifiants incorrects.");
      } else if (err instanceof ApiError) {
        setError(`Serveur indisponible ou erreur API (${err.status}).`);
      } else {
        setError("Serveur indisponible. Vérifiez que l'API est démarrée.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand brand-login">
          <div className="brand-mark">RH</div>
          <div>
            <strong>RH Solution</strong>
            <span>Connexion sécurisée</span>
          </div>
        </div>
        <label>
          Utilisateur
          <input value={username} onChange={event => setUsername(event.target.value)} />
        </label>
        <label>
          Mot de passe
          <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoFocus />
        </label>
        {error && <div className="alert alert-error">{error}</div>}
        <Button variant="primary" disabled={loading}>{loading ? "Connexion..." : "Se connecter"}</Button>
      </form>
    </div>
  );
}
