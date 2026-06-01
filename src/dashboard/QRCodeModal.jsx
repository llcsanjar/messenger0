import { useState, useEffect } from "react"
import QRCode from "qrcode"
import pako from 'pako'

function QRCodeModal({ user, onClose, t }) {
  const [qrCodeUrl, setQrCodeUrl] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [transferId, setTransferId] = useState(null)

  const generateQRCode = async () => {
    try {
      const publicKey = localStorage.getItem("public_key")
      const privateKey = localStorage.getItem("private_key")

      if (!publicKey || !privateKey) {
        console.error("Keys not found")
        return
      }

      // Роҳи ҳалли 1: Фишурдани маълумот
      const qrData = {
        type: "account_transfer",
        email: user?.email,
        name: user?.displayName,
        photoURL: user?.photoURL?.substring(0, 100), // Фақат қисми кӯтоҳи URL
        timestamp: Date.now()
      }

      // Калидҳоро ба қисмҳо ҷудо карда, дар IndexedDB нигоҳ дорем
      const keyParts = splitKey(privateKey, 500)
      const publicKeyParts = splitKey(publicKey, 500)
      
      qrData.keyPartsCount = keyParts.length
      qrData.publicKeyPartsCount = publicKeyParts.length
      qrData.transferId = generateTransferId()
      
      // Нигоҳдории қисмҳо дар IndexedDB
      await storeKeysInIndexedDB(qrData.transferId, {
        privateKeyParts: keyParts,
        publicKeyParts: publicKeyParts
      })
      
      // QR код танҳо метамаълумотро дар бар мегирад
      const jsonString = JSON.stringify(qrData)
      
      // Фишурдани маълумот пеш аз QR код
      const compressed = pako.deflate(jsonString, { level: 9 })
      const base64Compressed = btoa(String.fromCharCode(...compressed))
      
      // Санҷиши андоза
      console.log(`Original size: ${jsonString.length} chars`)
      console.log(`Compressed size: ${base64Compressed.length} chars`)
      
      if (base64Compressed.length > 1800) {
        throw new Error("Data still too large for QR code")
      }
      
      const qrUrl = await QRCode.toDataURL(base64Compressed, {
        width: 300,
        margin: 2,
        errorCorrectionLevel: 'H', // Баландтарин сатҳи ислоҳи хатогиҳо
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      })
      
      setQrCodeUrl(qrUrl)
      setTransferId(qrData.transferId)
    } catch (error) {
      console.error("QR Code generation error:", error)
      // Агар ҳанӯз хеле калон бошад, роҳи дигарро истифода барем
      await generateServerTransferCode()
    } finally {
      setIsLoading(false)
    }
  }
  
  const generateServerTransferCode = async () => {
    try {
      // Роҳи ҳалли 2: Истифодаи сервер барои нигоҳдории муваққатӣ
      const publicKey = localStorage.getItem("public_key")
      const privateKey = localStorage.getItem("private_key")
      
      const response = await fetch(`${API_URL}/create-transfer-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user?.email,
          public_key: publicKey,
          private_key: privateKey
        })
      })
      
      const data = await response.json()
      
      // QR код фақат токенро дар бар мегирад
      const tokenData = {
        type: "server_transfer",
        token: data.token,
        email: user?.email
      }
      
      const jsonString = JSON.stringify(tokenData)
      const qrUrl = await QRCode.toDataURL(jsonString, {
        width: 300,
        margin: 2,
        errorCorrectionLevel: 'H'
      })
      
      setQrCodeUrl(qrUrl)
      setTransferId(data.token)
    } catch (serverError) {
      console.error("Server transfer error:", serverError)
      setIsLoading(false)
      alert(t.qrTooBig)
    }
  }
  
  const splitKey = (key, chunkSize) => {
    const chunks = []
    for (let i = 0; i < key.length; i += chunkSize) {
      chunks.push(key.substring(i, i + chunkSize))
    }
    return chunks
  }
  
  const generateTransferId = () => {
    return 'transfer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  }
  
  const storeKeysInIndexedDB = (transferId, keysData) => {
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
        const transaction = db.transaction(["transfers"], "readwrite")
        const store = transaction.objectStore("transfers")
        
        const transferData = {
          id: transferId,
          ...keysData,
          timestamp: Date.now(),
          expiresAt: Date.now() + 5 * 60 * 1000 // 5 дақиқа
        }
        
        const putRequest = store.put(transferData)
        putRequest.onsuccess = () => resolve()
        putRequest.onerror = () => reject()
      }
      
      request.onerror = () => reject()
    })
  }

  const copyToClipboard = () => {
    if (qrCodeUrl) {
      const canvas = document.createElement('canvas')
      const img = new Image()
      img.onload = () => {
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        canvas.toBlob((blob) => {
          navigator.clipboard.write([
            new ClipboardItem({
              [blob.type]: blob
            })
          ])
          alert(t.copiedToClipboard)
        })
      }
      img.src = qrCodeUrl
    }
  }

  const downloadQRCode = () => {
    if (qrCodeUrl) {
      const link = document.createElement('a')
      link.download = `account_qr_${user?.email}.png`
      link.href = qrCodeUrl
      link.click()
    }
  }

  useEffect(() => {
    generateQRCode()
  }, [])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal qr-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t.transferAccount}</h2>
        <p className="qr-description">
          {t.scanToTransfer}
        </p>
        
        <div className="qr-code-container">
          {isLoading ? (
            <div className="qr-loading">{t.generating}</div>
          ) : (
            <>
              <img 
                src={qrCodeUrl || undefined} 
                alt="QR Code" 
                className="qr-code-image"
                onError={(e) => {
                  e.target.style.display = 'none'
                  console.error("QR image failed to load")
                }}
              />
              {qrCodeUrl && (
                <div className="qr-warning">
                  ⚠️ {t.qrWarning}
                </div>
              )}
            </>
          )}
        </div>
        
        {qrCodeUrl && (
          <>
            {transferId && (
              <p className="transfer-id">
                ID: {transferId}
              </p>
            )}
          </>
        )}
        
        <button className="close-modal-btn" onClick={onClose}>
          {t.close}
        </button>
      </div>
    </div>
  )
}

export default QRCodeModal