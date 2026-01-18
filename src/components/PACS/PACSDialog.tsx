import React, { useState } from 'react'
import { pacsService, PacsConfig, PacsQuery } from '../../services/pacsService'
import { X, Search, Server, Settings } from 'lucide-react'
import './PACSDialog.css'

interface PACSDialogProps {
  isOpen: boolean
  onClose: () => void
}

const PACSDialog: React.FC<PACSDialogProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'search' | 'config'>('search')
  const [config, setConfig] = useState<PacsConfig>({
    host: '',
    port: 104,
    aeTitle: '',
    callingAETitle: 'RADIANT_CLONE',
  })
  const [query, setQuery] = useState<PacsQuery>({})
  const [isConnected, setIsConnected] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])

  if (!isOpen) return null

  const handleTestConnection = async () => {
    try {
      pacsService.setConfig(config)
      const result = await pacsService.echo()
      setIsConnected(result)
      if (result) {
        alert('Connection successful!')
      } else {
        alert('Connection failed. Please check your settings.')
      }
    } catch (error) {
      alert('Connection error: ' + (error as Error).message)
      setIsConnected(false)
    }
  }

  const handleSearch = async () => {
    try {
      pacsService.setConfig(config)
      const results = await pacsService.queryStudies(query)
      setSearchResults(results)
    } catch (error) {
      alert('Search error: ' + (error as Error).message)
    }
  }

  return (
    <div className="pacs-dialog-overlay" onClick={onClose}>
      <div className="pacs-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="pacs-dialog-header">
          <h2>PACS Connection</h2>
          <button className="close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="pacs-dialog-tabs">
          <button
            className={`tab-button ${activeTab === 'config' ? 'active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            <Settings size={16} />
            Configuration
          </button>
          <button
            className={`tab-button ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
          >
            <Search size={16} />
            Search
          </button>
        </div>

        <div className="pacs-dialog-content">
          {activeTab === 'config' && (
            <div className="config-section">
              <div className="form-group">
                <label>Host / IP Address</label>
                <input
                  type="text"
                  value={config.host}
                  onChange={(e) => setConfig({ ...config, host: e.target.value })}
                  placeholder="192.168.1.100"
                />
              </div>
              <div className="form-group">
                <label>Port</label>
                <input
                  type="number"
                  value={config.port}
                  onChange={(e) => setConfig({ ...config, port: Number(e.target.value) })}
                  placeholder="104"
                />
              </div>
              <div className="form-group">
                <label>AE Title</label>
                <input
                  type="text"
                  value={config.aeTitle}
                  onChange={(e) => setConfig({ ...config, aeTitle: e.target.value })}
                  placeholder="PACS_SERVER"
                />
              </div>
              <div className="form-group">
                <label>Calling AE Title</label>
                <input
                  type="text"
                  value={config.callingAETitle}
                  onChange={(e) => setConfig({ ...config, callingAETitle: e.target.value })}
                  placeholder="RADIANT_CLONE"
                />
              </div>
              <div className="connection-status">
                <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`} />
                <span>{isConnected ? 'Connected' : 'Not Connected'}</span>
              </div>
              <button className="test-button" onClick={handleTestConnection}>
                <Server size={16} />
                Test Connection
              </button>
            </div>
          )}

          {activeTab === 'search' && (
            <div className="search-section">
              <div className="form-group">
                <label>Patient ID</label>
                <input
                  type="text"
                  value={query.patientId || ''}
                  onChange={(e) => setQuery({ ...query, patientId: e.target.value })}
                  placeholder="Enter Patient ID"
                />
              </div>
              <div className="form-group">
                <label>Patient Name</label>
                <input
                  type="text"
                  value={query.patientName || ''}
                  onChange={(e) => setQuery({ ...query, patientName: e.target.value })}
                  placeholder="Enter Patient Name"
                />
              </div>
              <div className="form-group">
                <label>Study Date</label>
                <input
                  type="date"
                  value={query.studyDate || ''}
                  onChange={(e) => setQuery({ ...query, studyDate: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Modality</label>
                <select
                  value={query.modality || ''}
                  onChange={(e) => setQuery({ ...query, modality: e.target.value || undefined })}
                >
                  <option value="">All</option>
                  <option value="CT">CT</option>
                  <option value="MR">MR</option>
                  <option value="US">US</option>
                  <option value="CR">CR</option>
                  <option value="DX">DX</option>
                  <option value="MG">MG</option>
                  <option value="XA">XA</option>
                  <option value="NM">NM</option>
                  <option value="PT">PT</option>
                </select>
              </div>
              <button className="search-button" onClick={handleSearch}>
                <Search size={16} />
                Search Studies
              </button>

              {searchResults.length > 0 && (
                <div className="search-results">
                  <h3>Search Results ({searchResults.length})</h3>
                  <div className="results-list">
                    {searchResults.map((result, index) => (
                      <div key={index} className="result-item">
                        <div className="result-header">
                          <strong>{result.patientName || 'Unknown'}</strong>
                          <span>{result.modality || ''}</span>
                        </div>
                        <div className="result-meta">
                          <span>ID: {result.patientId || 'N/A'}</span>
                          <span>Date: {result.studyDate || 'N/A'}</span>
                        </div>
                        <div className="result-description">
                          {result.studyDescription || 'No description'}
                        </div>
                        <button className="retrieve-button">Retrieve</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PACSDialog
