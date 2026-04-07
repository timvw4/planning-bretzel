'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Building2, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // Vérifier que l'email est bien dans la liste des employés
    const { data: emailExists, error: rpcError } = await supabase
      .rpc('check_employee_email', { p_email: email.trim().toLowerCase() });

    if (rpcError || !emailExists) {
      setError("Cet email n'est pas reconnu. Vérifiez avec votre responsable que votre email est bien enregistré.");
      setLoading(false);
      return;
    }

    // Créer le compte
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    });

    if (signUpError) {
      if (signUpError.message.includes('already registered')) {
        setError('Un compte existe déjà avec cet email. Utilisez la page de connexion.');
      } else {
        setError(signUpError.message);
      }
      setLoading(false);
      return;
    }

    // Si la session est déjà active (confirmation email désactivée) → connexion directe
    if (signUpData.session) {
      window.location.href = '/employee';
      return;
    }

    // Sinon afficher l'écran "vérifiez votre email"
    setSuccess(true);
    setLoading(false);
  };

  // Écran de confirmation après inscription
  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Compte créé !</h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            Un email de confirmation a été envoyé à <strong>{email}</strong>.
            Cliquez sur le lien dans l&apos;email pour activer votre compte, puis connectez-vous.
          </p>
          <Link
            href="/login"
            className="inline-block w-full bg-indigo-600 text-white font-semibold rounded-2xl py-3 text-sm hover:bg-indigo-700 transition-colors"
          >
            Aller à la connexion
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg mb-4">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Créer mon compte</h1>
          <p className="text-slate-500 text-sm mt-1 text-center">
            Utilisez l&apos;email enregistré par votre responsable
          </p>
        </div>

        {/* Formulaire */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
          <form onSubmit={handleRegister} className="space-y-5">

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 ml-1">
                Adresse email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
                autoComplete="email"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Mot de passe */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 ml-1">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 caractères"
                  required
                  autoComplete="new-password"
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirmation mot de passe */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 ml-1">
                Confirmer le mot de passe
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Répétez le mot de passe"
                required
                autoComplete="new-password"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Erreur */}
            {error && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <p className="text-xs text-red-600 font-medium">{error}</p>
              </div>
            )}

            {/* Bouton */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-2xl py-3.5 text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-200"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Vérification…
                </>
              ) : (
                'Créer mon compte'
              )}
            </button>
          </form>

          {/* Lien login */}
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-400">
              Déjà un compte ?{' '}
              <Link href="/login" className="text-indigo-600 font-semibold hover:underline">
                Se connecter
              </Link>
            </p>
          </div>
        </div>

        {/* Info */}
        <p className="text-center text-xs text-slate-400 mt-6 px-4">
          Votre email doit être enregistré par votre responsable avant de pouvoir créer un compte.
        </p>
      </div>
    </div>
  );
}
