import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import SupplierRegistration from './components/SupplierRegistration.jsx'

const page = window.location.pathname.replace(/\/$/, '') === '/daftar-supplier'
  ? <SupplierRegistration /> : <App />

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {page}
  </StrictMode>,
)
