'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CalendarDays, Eye, EyeOff, CheckCircle, KeyRound } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  // Supabase envoie le token dans l'URL — on vérifie la session dès le chargement
  useEffect(() => {
    const supabase = createClient();

    // Vérifier si une session existe déjà (token déjà traité)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setReady(true);
      }
    });

    // Écouter aussi l'événement au cas où il arrive après le montage
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError('Erreur lors de la réinitialisation. Essayez de redemander un lien.');
      setLoading(false);
      return;
    }

    setDone(true);
    setLoading(false);
    setTimeout(() => router.push('/login'), 3000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Titre */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 shadow-lg mb-4">
            <CalendarDays className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Nouveau mot de passe</h1>
          <p className="text-sm text-slate-500 mt-1">Choisissez un nouveau mot de passe sécurisé</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          {done ? (
            /* Succès */
            <div className="text-center space-y-4">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">Mot de passe mis à jour !</p>
                <p className="text-sm text-slate-500 mt-1">
                  Vous allez être redirigé vers la page de connexion...
                </p>
              </div>
            </div>
          ) : !ready ? (
            /* En attente du token */
            <div className="text-center space-y-3 py-4">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center mx-auto">
                <KeyRound className="w-5 h-5 text-indigo-600" />
              </div>
              <p className="text-sm text-slate-500">Vérification du lien en cours...</p>
              <p className="text-xs text-slate-400">
                Si cette page reste bloquée,{' '}
                <a href="/forgot-password" className="text-indigo-600 underline">
                  redemandez un lien
                </a>.
              </p>
            </div>
          ) : (
            /* Formulaire */
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Nouveau mot de passe</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full h-10 px-3 pr-10 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Confirmer le mot de passe</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                {loading && (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {loading ? 'Enregistrement...' : 'Enregistrer le nouveau mot de passe'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
