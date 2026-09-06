import { Link, useNavigate } from 'react-router-dom';
import { Home, User, Shield, LogOut } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useState, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

export default function Navbar() {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const { lang, setLanguage, t } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      checkAdmin(session?.user?.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      checkAdmin(session?.user?.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdmin = async (userId) => {
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    const { data } = await supabase.from('profiles').select('is_admin').eq('id', userId).single();
    setIsAdmin(data?.is_admin || false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <nav className="navbar">
      <Link to="/" className="nav-brand">AdditiveAlert</Link>
      
      <div className="nav-actions">
        {/* Language selector */}
        <div className="lang-selector">
          {['cs', 'en', 'de'].map((code) => (
            <button
              key={code}
              type="button"
              className={`lang-btn ${lang === code ? 'active' : ''}`}
              onClick={() => setLanguage(code)}
              title={code.toUpperCase()}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="nav-links">
          <Link to="/" className="nav-item" title={t.navHome}><Home size={20} /></Link>
          {isAdmin && (
            <Link to="/admin" className="nav-item" title={t.navAdmin}>
              <Shield size={20} color="var(--rating-5)"/>
            </Link>
          )}
          {session ? (
            <>
              <Link to="/profile" className="nav-item" title={t.navHistory}><User size={20} /></Link>
              <button onClick={handleLogout} className="nav-item btn-icon" title={t.navLogout}>
                <LogOut size={20} />
              </button>
            </>
          ) : (
            <Link to="/auth" className="nav-item" title={t.navLogin}><User size={20} /></Link>
          )}
        </div>
      </div>
    </nav>
  );
}
