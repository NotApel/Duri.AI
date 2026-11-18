
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hlbnjwcosgxpigecivxd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_wRG4earrz1VsFBNEL1dmUw_Cc_5ACEJ';

// eslint-disable-next-line react-refresh/only-export-components
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Komponen Utama Paparan Notifikasi Real-Time
export default function RealtimeNotification() {
  const [incomingAlert, setIncomingAlert] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Dengar perubahan secara live pada table 'notification'
    const notificationChannel = supabase
      .channel('realtime-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',      // Tangkap bila ada rekod BARU masuk
          schema: 'public',    
          table: 'notification', 
        },
        (payload) => {
          console.log('Notifikasi Live Diterima:', payload.new);
          setIncomingAlert(payload.new);
          setIsOpen(true);

          if ('vibrate' in navigator) {
            navigator.vibrate([300, 100, 300]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationChannel);
    };
  }, []);

  if (!isOpen || !incomingAlert) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <h2 style={{ color: '#ff4757', marginTop: 0 }}>
          🚨 {incomingAlert.title || 'Amaran Durian Jatuh!'}
        </h2>
        <p style={{ fontSize: '16px', lineHeight: '1.5', color: '#ddd' }}>
          {incomingAlert.message || incomingAlert.message_noti}
        </p>
        <button 
          style={styles.button}
          onClick={() => setIsOpen(false)}
        >
          Faham / Tutup Amaran
        </button>
      </div>
    </div>
  );
}

// Gaya rekaan paparan (Dark Aesthetic yang lengkap)
const styles = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    zIndex: 9999,
  },
  card: {
    backgroundColor: '#161622', 
    color: '#ffffff',
    padding: '30px',
    borderRadius: '12px',
    maxWidth: '450px',
    width: '90%',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    border: '2px solid #ff4757',
    textAlign: 'center'
  },
  button: {
    backgroundColor: '#ff4757',
    color: '#ffffff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '15px'
  }
};