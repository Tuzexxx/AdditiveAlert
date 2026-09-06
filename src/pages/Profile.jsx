import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  AlertTriangle, 
  CheckCircle, 
  Info, 
  Clock, 
  Smartphone, 
  User, 
  Trash2, 
  ArrowRight, 
  Sparkles, 
  LogIn, 
  LogOut,
  Camera,
  FileText
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { getDeviceId } from '../utils/deviceId';

export default function Profile() {
  const [session, setSession] = useState(null);
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState('');
  const { lang, t } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    const id = getDeviceId();
    setDeviceId(id);

    const loadHistory = async () => {
      setLoading(true);
      
      // 1. Check if user is logged in
      let currentSession = null;
      if (supabase) {
        try {
          const { data } = await supabase.auth.getSession();
          currentSession = data?.session;
          setSession(currentSession);
        } catch {
          // ignore
        }
      }

      // 2. Load from local storage (anonymous device history)
      let localScans = [];
      try {
        const stored = localStorage.getItem('additivealert_scan_history');
        if (stored) {
          localScans = JSON.parse(stored);
        }
      } catch (err) {
        console.warn('Failed to parse local scan history:', err);
      }

      // 3. If authenticated, optionally fetch cloud history and merge
      if (currentSession && supabase) {
        try {
          const { data, error } = await supabase
            .from('scan_history')
            .select('*')
            .eq('user_id', currentSession.user.id)
            .order('scanned_at', { ascending: false });

          if (!error && data && data.length > 0) {
            const cloudScans = data.map((item) => ({
              id: item.id || `cloud_${Date.now()}`,
              timestamp: item.scanned_at,
              snippet: item.ingredient_name,
              deviceId: 'Cloud',
              hasPhoto: false,
              maxRating: item.rating,
              additives: [
                {
                  id: item.e_number || 'N/A',
                  name: item.ingredient_name,
                  rating: item.rating,
                  category: item.risk_level,
                  original_text: item.ingredient_name,
                },
              ],
            }));
            const combined = [...localScans];
            cloudScans.forEach((cs) => {
              if (!combined.some((ls) => ls.timestamp === cs.timestamp)) {
                combined.push(cs);
              }
            });
            setScans(combined);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.warn('Could not fetch cloud scan history:', err);
        }
      }

      setScans(localScans);
      setLoading(false);
    };

    loadHistory();

    const handleHistoryUpdate = () => {
      try {
        const stored = localStorage.getItem('additivealert_scan_history');
        if (stored) {
          setScans(JSON.parse(stored));
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener('additivealert_history_updated', handleHistoryUpdate);
    window.addEventListener('storage', handleHistoryUpdate);
    return () => {
      window.removeEventListener('additivealert_history_updated', handleHistoryUpdate);
      window.removeEventListener('storage', handleHistoryUpdate);
    };
  }, []);

  const handleClearHistory = () => {
    if (window.confirm(t.confirmClearHistory)) {
      localStorage.removeItem('additivealert_scan_history');
      localStorage.removeItem('additivealert_risky_counts');
      setScans([]);
      window.dispatchEvent(new Event('additivealert_history_updated'));
      window.dispatchEvent(new Event('additivealert_counts_updated'));
    }
  };

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
      setSession(null);
      navigate('/profile');
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(lang === 'cs' ? 'cs-CZ' : lang === 'de' ? 'de-DE' : 'en-US', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const getLocalizedAdditiveName = (additive) => {
    if (lang === 'en') return additive.englishName || additive.name;
    if (lang === 'de') return additive.germanName || additive.name;
    return additive.czechName || additive.name;
  };

  // Metrics calculation
  const totalScans = scans.length;
  const totalDetectedAdditives = scans.reduce((acc, scan) => acc + (scan.additives?.length || 0), 0);
  const totalRiskyAdditives = scans.reduce(
    (acc, scan) => acc + (scan.additives?.filter((a) => a.rating >= 4)?.length || 0),
    0
  );

  return (
    <div className="profile-container" style={{ width: '100%' }}>
      {/* Header & Device Identity */}
      <header className="header" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0 }}>{t.navHistory}</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {session ? session.user.email : t.anonymousNotice}
            </p>
          </div>

          {session ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleLogout}
              style={{ padding: '8px 14px', fontSize: '0.85rem' }}
            >
              <LogOut size={16} />
              {t.navLogout}
            </button>
          ) : (
            <Link
              to="/auth"
              className="btn btn-secondary"
              style={{ padding: '8px 14px', fontSize: '0.85rem', textDecoration: 'none' }}
            >
              <LogIn size={16} />
              {t.navLogin}
            </Link>
          )}
        </div>

        {/* Device ID pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '12px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--glass-border)',
            borderRadius: '20px',
            padding: '4px 12px',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
          }}
        >
          <Smartphone size={13} color="var(--accent-color)" />
          <span>{t.deviceIdLabel}: <code style={{ color: 'var(--text-primary)' }}>{deviceId ? `${deviceId.substring(0, 13)}...` : 'Unknown'}</code></span>
          {!session && (
            <span style={{ color: 'var(--rating-2)', fontWeight: 700, marginLeft: '4px' }}>
              • {t.anonymousDevice}
            </span>
          )}
        </div>
      </header>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '20px' }}>
        <div className="glass-panel" style={{ padding: '14px', margin: 0, textAlign: 'center' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>{totalScans}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t.totalScans}</div>
        </div>

        <div className="glass-panel" style={{ padding: '14px', margin: 0, textAlign: 'center' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent-color)' }}>{totalDetectedAdditives}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t.detectedAdditives}</div>
        </div>

        <div className="glass-panel" style={{ padding: '14px', margin: 0, textAlign: 'center' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: totalRiskyAdditives > 0 ? 'var(--rating-5)' : 'var(--rating-1)' }}>
            {totalRiskyAdditives}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t.riskyAdditives}</div>
        </div>
      </div>

      {/* Action Bar (Clear History) */}
      {scans.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClearHistory}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              color: '#fca5a5',
              borderColor: 'rgba(239, 68, 68, 0.3)',
              background: 'rgba(239, 68, 68, 0.1)',
            }}
          >
            <Trash2 size={14} />
            {t.clearHistory}
          </button>
        </div>
      )}

      {/* Scans List */}
      {loading ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '30px' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Načítám historii...</p>
        </div>
      ) : scans.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <Smartphone size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '18px' }}>
            {t.noHistoryYet}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/')}
            style={{ maxWidth: '240px', margin: '0 auto' }}
          >
            <Sparkles size={16} />
            {t.startScanning}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {scans.map((scan) => {
            const highestRating = scan.maxRating || Math.max(...(scan.additives || []).map((a) => a.rating || 1), 1);

            return (
              <div
                key={scan.id}
                className="glass-panel"
                style={{
                  margin: 0,
                  padding: '16px',
                  borderLeft: `4px solid var(--rating-${highestRating})`,
                  background: 'rgba(26, 29, 36, 0.85)',
                }}
              >
                {/* Scan Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {scan.hasPhoto ? <Camera size={15} color="var(--accent-color)" /> : <FileText size={15} />}
                    <Clock size={13} />
                    <span>{formatDate(scan.timestamp)}</span>
                  </div>

                  <span className={`badge badge-${highestRating}`}>
                    {t.riskScore}: {highestRating}/6
                  </span>
                </div>

                {/* Scan Snippet / Label Text */}
                {scan.snippet && (
                  <div
                    style={{
                      fontSize: '0.84rem',
                      color: 'var(--text-secondary)',
                      background: 'rgba(0, 0, 0, 0.25)',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      marginBottom: '12px',
                      fontStyle: 'italic',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    "{scan.snippet}"
                  </div>
                )}

                {/* Additives list for this scan */}
                {(!scan.additives || scan.additives.length === 0) ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--rating-1)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle size={15} />
                    {t.noAdditivesFound}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {scan.additives.map((additive, aIdx) => {
                      const localizedName = getLocalizedAdditiveName(additive);

                      return (
                        <div
                          key={aIdx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '6px',
                            background: 'rgba(0, 0, 0, 0.2)',
                            borderRadius: '8px',
                            padding: '8px 12px',
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 700, color: 'var(--accent-color)', marginRight: '6px' }}>
                              {additive.id}
                            </span>
                            <span style={{ fontWeight: 600 }}>{localizedName}</span>
                            {additive.original_text && additive.original_text !== additive.id && (
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: '6px' }}>
                                ({additive.original_text})
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span className={`badge badge-${additive.rating}`} style={{ fontSize: '0.72rem' }}>
                              {t.riskScore}: {additive.rating}/6
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Cloud Sync Callout for Anonymous Users */}
      {!session && (
        <div
          className="glass-panel"
          style={{
            marginTop: '24px',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(0, 0, 0, 0.3))',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              {t.syncCloudAccount}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {lang === 'cs'
                ? 'Vytvořením účtu získáte možnost sdílet historii mezi telefonem a počítačem.'
                : lang === 'de'
                ? 'Erstellen Sie ein Konto, um Ihren Verlauf zwischen Handy und PC zu teilen.'
                : 'Create an account to sync your scan history between your phone and computer.'}
            </p>
          </div>
          <Link
            to="/auth"
            className="btn btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.85rem', textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            {t.navLogin}
            <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
