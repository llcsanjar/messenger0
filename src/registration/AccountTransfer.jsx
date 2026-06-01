import { useState, useEffect, useRef } from 'react'
import QrScanner from 'qr-scanner'
import './AccountTransfer.css'

function AccountTransfer({ email, onSuccess, onCancel, t }) {
  const [scanning, setScanning] = useState(false)
  const [scanningMode, setScanningMode] = useState('environment') // 'environment' (задняя) ё 'user' (передняя)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const videoRef = useRef(null)
  const scannerRef = useRef(null)
  const [hasBackCamera, setHasBackCamera] = useState(true)
  const [hasFrontCamera, setHasFrontCamera] = useState(true)

  // Санҷидани дастрасии камераҳо
  useEffect(() => {
    const checkCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter(device => device.kind === 'videoinput')
        
        const hasBack = videoDevices.some(device => 
          device.label.toLowerCase().includes('back') || 
          device.label.toLowerCase().includes('rear') ||
          device.label.toLowerCase().includes('environ')
        )
        const hasFront = videoDevices.some(device => 
          device.label.toLowerCase().includes('front') || 
          device.label.toLowerCase().includes('face') ||
          device.label.toLowerCase().includes('user')
        )
        
        setHasBackCamera(hasBack || videoDevices.length > 1)
        setHasFrontCamera(hasFront || videoDevices.length > 0)
      } catch (err) {
        console.error('Error checking cameras:', err)
      }
    }
    checkCameras()
  }, [])

  const startScanner = async () => {
    setError(null)
    setScanning(true)
    
    if (scannerRef.current) {
      scannerRef.current.destroy()
      scannerRef.current = null
    }

    try {
      scannerRef.current = new QrScanner(
        videoRef.current,
        result => {
          handleScan(result.data)
        },
        {
          preferredCamera: scanningMode,
          highlightScanRegion: true,
          highlightCodeOutline: true,
          maxScansPerSecond: 5,
          returnDetailedScanResult: true,
        }
      )
      
      await scannerRef.current.start()
    } catch (err) {
      console.error('Failed to start scanner:', err)
      setError(t.camera_access_error || 'Дастрасӣ ба камера имконпазир нест')
      setScanning(false)
    }
  }

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.destroy()
      scannerRef.current = null
    }
    setScanning(false)
  }

  const handleScan = async (data) => {
    if (loading) return
    
    setLoading(true)
    stopScanner()
    
    try {
      let transferData
      
      // Кӯшиши парси кардани маълумоти QR код
      if (data.startsWith('{')) {
        transferData = JSON.parse(data)
      } else {
        // Агар маълумот фишурда бошад
        const compressed = atob(data)
        const jsonString = pako.inflate(compressed, { to: 'string' })
        transferData = JSON.parse(jsonString)
      }
      
      if (transferData.type === 'account_transfer' && transferData.email === email) {
        // Маълумотро аз IndexedDB гирифтан (агар қисмҳо ҷудо бошанд)
        let publicKey = transferData.public_key
        let privateKey = transferData.private_key
        
        if (transferData.transferId && !publicKey) {
          const keys = await retrieveKeysFromIndexedDB(transferData.transferId)
          if (keys) {
            publicKey = keys.public_key
            privateKey = keys.private_key
          }
        }
        
        if (publicKey && privateKey) {
          // Захира кардани калидҳо дар localStorage
          localStorage.setItem('public_key', publicKey)
          localStorage.setItem('private_key', privateKey)
          
          onSuccess({
            public_key: publicKey,
            private_key: privateKey
          })
        } else {
          setError(t.invalid_qr || 'QR код эътибор надорад')
          setTimeout(() => startScanner(), 2000)
        }
      } else {
        setError(t.invalid_qr || 'Ин QR код ба ин почтаи электронӣ тааллуқ надорад')
        setTimeout(() => startScanner(), 2000)
      }
    } catch (err) {
      console.error('Error parsing QR code:', err)
      setError(t.invalid_qr || 'QR код эътибор надорад')
      setTimeout(() => startScanner(), 2000)
    } finally {
      setLoading(false)
    }
  }

  const toggleCamera = () => {
    setScanningMode(prev => prev === 'environment' ? 'user' : 'environment')
    setTimeout(() => {
      if (scanning) {
        startScanner()
      }
    }, 100)
  }

  useEffect(() => {
    if (scanning) {
      startScanner()
    }
    return () => {
      if (scannerRef.current) {
        scannerRef.current.destroy()
      }
    }
  }, [scanning, scanningMode])

  return (
    <div className="account-transfer-overlay">
      <div className="account-transfer-modal">
        <button className="transfer-close-btn" onClick={onCancel}>
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <div className="transfer-header">
          <div className="transfer-icon">
            <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" strokeWidth="1.5" fill="none">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <h2>{t.transfer_account_title || "Интиқоли аккаунт"}</h2>
          <p className="transfer-description">
            {t.scan_qr_from_old_device || "Барои ворид шудан ба ин аккаунт, лутфан QR кодеро аз дастгоҳи пешинаи худ скан кунед"}
          </p>
        </div>

        <div className="scanner-container">
          {!scanning ? (
            <div className="scanner-placeholder">
              <button 
                className="start-scan-btn"
                onClick={() => setScanning(true)}
              >
                <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="2" fill="none">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                  <circle cx="12" cy="13" r="4"></circle>
                </svg>
                <span>{t.start_scanning || "Оғози скан"}</span>
              </button>
            </div>
          ) : (
            <>
              <div className="scanner-view">
                <video ref={videoRef} className="scanner-video" />
                <div className="scan-overlay">
                  <div className="scan-frame"></div>
                </div>
              </div>
              
              {loading && (
                <div className="scan-loading">
                  <div className="loading-spinner"></div>
                  <span>{t.processing || "Қабул кардани маълумот..."}</span>
                </div>
              )}

              {(hasBackCamera || hasFrontCamera) && (
                <button 
                  className="camera-toggle-btn"
                  onClick={toggleCamera}
                  title={t.switch_camera || "Иваз кардани камера"}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                    <path d="M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"></path>
                  </svg>
                </button>
              )}
              
              <button className="stop-scan-btn" onClick={stopScanner}>
                {t.cancel || "Бекор"}
              </button>
            </>
          )}
          
          {error && (
            <div className="scan-error">
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="transfer-info">
          <p className="info-text">
            {t.transfer_info || "💡 Агар шумо ба дастгоҳи пешина дастрасӣ надошта бошед, лутфан барои барқарор кардани дастрасӣ ба дастгирии техникӣ муроҷиат кунед."}
          </p>
        </div>
      </div>
    </div>
  )
}

// Функсияи гирифтани калидҳо аз IndexedDB
async function retrieveKeysFromIndexedDB(transferId) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("KeyTransferDB", 1)
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains("transfers")) {
        db.createObjectStore("transfers", { keyPath: "id" })
      }
    }
    
    request.onsuccess = (event) => {
      const db = event.target.result
      const transaction = db.transaction(["transfers"], "readonly")
      const store = transaction.objectStore("transfers")
      
      const getRequest = store.get(transferId)
      getRequest.onsuccess = () => {
        const data = getRequest.result
        if (data && data.public_key && data.private_key) {
          resolve({
            public_key: data.public_key,
            private_key: data.private_key
          })
        } else if (data && data.publicKeyParts && data.privateKeyParts) {
          resolve({
            public_key: data.publicKeyParts.join(''),
            private_key: data.privateKeyParts.join('')
          })
        } else {
          resolve(null)
        }
      }
      getRequest.onerror = () => resolve(null)
    }
    
    request.onerror = () => resolve(null)
  })
}

export default AccountTransfer