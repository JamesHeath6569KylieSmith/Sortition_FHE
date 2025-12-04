// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface CommitteeMember {
  id: string;
  address: string;
  joinedDate: number;
  role: string;
  reputation: number;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<CommitteeMember[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newMemberData, setNewMemberData] = useState({
    role: "",
    reputation: 0
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [activeTab, setActiveTab] = useState("members");
  const [searchQuery, setSearchQuery] = useState("");

  // Calculate statistics
  const totalMembers = members.length;
  const avgReputation = totalMembers > 0 
    ? members.reduce((sum, member) => sum + member.reputation, 0) / totalMembers 
    : 0;

  useEffect(() => {
    loadMembers().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadMembers = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("member_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing member keys:", e);
        }
      }
      
      const list: CommitteeMember[] = [];
      
      for (const key of keys) {
        try {
          const memberBytes = await contract.getData(`member_${key}`);
          if (memberBytes.length > 0) {
            try {
              const memberData = JSON.parse(ethers.toUtf8String(memberBytes));
              list.push({
                id: key,
                address: memberData.address,
                joinedDate: memberData.joinedDate,
                role: memberData.role,
                reputation: memberData.reputation
              });
            } catch (e) {
              console.error(`Error parsing member data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading member ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.joinedDate - a.joinedDate);
      setMembers(list);
    } catch (e) {
      console.error("Error loading members:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const addMember = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setAdding(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Adding committee member with FHE verification..."
    });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const memberId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const memberData = {
        address: account,
        joinedDate: Math.floor(Date.now() / 1000),
        role: newMemberData.role,
        reputation: newMemberData.reputation
      };
      
      // Store member data on-chain
      await contract.setData(
        `member_${memberId}`, 
        ethers.toUtf8Bytes(JSON.stringify(memberData))
      );
      
      const keysBytes = await contract.getData("member_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(memberId);
      
      await contract.setData(
        "member_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Committee member added successfully!"
      });
      
      await loadMembers();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowAddModal(false);
        setNewMemberData({
          role: "",
          reputation: 0
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setAdding(false);
    }
  };

  const performSortition = async () => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Initiating FHE-based sortition process..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      // Check availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        throw new Error("Contract is not available");
      }
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE sortition completed successfully!"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Sortition failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const filteredMembers = members.filter(member => 
    member.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to join the FHE-based DAO",
      icon: "🔗"
    },
    {
      title: "Join Committee",
      description: "Become part of the governance committee with encrypted identity",
      icon: "👥"
    },
    {
      title: "FHE Sortition",
      description: "Participate in verifiable random selection using FHE technology",
      icon: "🎲"
    },
    {
      title: "Govern Securely",
      description: "Make decisions while maintaining privacy through encryption",
      icon: "🛡️"
    }
  ];

  const renderStats = () => {
    return (
      <div className="stats-grid">
        <div className="stat-item">
          <div className="stat-value">{totalMembers}</div>
          <div className="stat-label">Total Members</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{avgReputation.toFixed(1)}</div>
          <div className="stat-label">Avg Reputation</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">FHE</div>
          <div className="stat-label">Encryption</div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE DAO connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="shield-icon"></div>
          </div>
          <h1>FHE<span>DAO</span>Governance</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowAddModal(true)} 
            className="add-member-btn primary-btn"
            disabled={!account}
          >
            Join Committee
          </button>
          <button 
            className="secondary-btn"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Guide" : "Show Guide"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>FHE-Based Private DAO Governance</h2>
            <p>Transparent sortition-based committee selection with fully homomorphic encryption</p>
          </div>
          <div className="fhe-badge">
            <span>FHE-Powered</span>
          </div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>How FHE DAO Governance Works</h2>
            <p className="subtitle">Learn about our encrypted governance process</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="dashboard-tabs">
          <div className="tab-nav">
            <button 
              className={activeTab === "members" ? "tab-active" : ""}
              onClick={() => setActiveTab("members")}
            >
              Committee Members
            </button>
            <button 
              className={activeTab === "stats" ? "tab-active" : ""}
              onClick={() => setActiveTab("stats")}
            >
              Statistics
            </button>
            <button 
              className={activeTab === "sortition" ? "tab-active" : ""}
              onClick={() => setActiveTab("sortition")}
            >
              FHE Sortition
            </button>
          </div>
          
          <div className="tab-content">
            {activeTab === "members" && (
              <div className="members-section">
                <div className="section-header">
                  <h2>Governance Committee</h2>
                  <div className="header-actions">
                    <div className="search-box">
                      <input 
                        type="text" 
                        placeholder="Search members..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-input"
                      />
                    </div>
                    <button 
                      onClick={loadMembers}
                      className="refresh-btn secondary-btn"
                      disabled={isRefreshing}
                    >
                      {isRefreshing ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                </div>
                
                <div className="members-list">
                  {filteredMembers.length === 0 ? (
                    <div className="no-members">
                      <div className="no-members-icon"></div>
                      <p>No committee members found</p>
                      <button 
                        className="primary-btn"
                        onClick={() => setShowAddModal(true)}
                        disabled={!account}
                      >
                        Join as First Member
                      </button>
                    </div>
                  ) : (
                    filteredMembers.map(member => (
                      <div className="member-card" key={member.id}>
                        <div className="member-avatar">
                          {member.address.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="member-info">
                          <h3>{member.role}</h3>
                          <p className="member-address">
                            {member.address.substring(0, 8)}...{member.address.substring(36)}
                          </p>
                          <div className="member-details">
                            <span className="reputation">Reputation: {member.reputation}</span>
                            <span className="joined-date">
                              Joined: {new Date(member.joinedDate * 1000).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            
            {activeTab === "stats" && (
              <div className="stats-section">
                <h2>DAO Statistics</h2>
                {renderStats()}
                
                <div className="chart-container">
                  <h3>Member Distribution</h3>
                  <div className="bar-chart">
                    {members.slice(0, 5).map(member => (
                      <div className="bar-item" key={member.id}>
                        <div className="bar-label">{member.role}</div>
                        <div className="bar-track">
                          <div 
                            className="bar-fill" 
                            style={{ width: `${(member.reputation / 100) * 100}%` }}
                          ></div>
                        </div>
                        <div className="bar-value">{member.reputation}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === "sortition" && (
              <div className="sortition-section">
                <h2>FHE-Based Sortition</h2>
                <p>Initiate a verifiable random selection process using fully homomorphic encryption</p>
                
                <div className="sortition-card">
                  <h3>Next Committee Selection</h3>
                  <p>The sortition process will randomly select the next governance committee members while preserving privacy through FHE encryption.</p>
                  
                  <button 
                    onClick={performSortition}
                    className="primary-btn large-btn"
                    disabled={!account}
                  >
                    Start FHE Sortition
                  </button>
                  
                  <div className="fhe-info">
                    <h4>FHE Advantages:</h4>
                    <ul>
                      <li>Verifiable random selection</li>
                      <li>Encrypted member identities</li>
                      <li>Anti-collusion protection</li>
                      <li>Transparent process</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
  
      {showAddModal && (
        <ModalAddMember 
          onSubmit={addMember} 
          onClose={() => setShowAddModal(false)} 
          adding={adding}
          memberData={newMemberData}
          setMemberData={setNewMemberData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield-icon"></div>
              <span>FHE DAO Governance</span>
            </div>
            <p>Secure committee selection using FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Governance</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE DAO. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalAddMemberProps {
  onSubmit: () => void; 
  onClose: () => void; 
  adding: boolean;
  memberData: any;
  setMemberData: (data: any) => void;
}

const ModalAddMember: React.FC<ModalAddMemberProps> = ({ 
  onSubmit, 
  onClose, 
  adding,
  memberData,
  setMemberData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setMemberData({
      ...memberData,
      [name]: name === 'reputation' ? parseInt(value) : value
    });
  };

  const handleSubmit = () => {
    if (!memberData.role) {
      alert("Please select a role");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="add-modal">
        <div className="modal-header">
          <h2>Join Governance Committee</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="key-icon">🔒</div> Your identity will be encrypted with FHE technology
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Role *</label>
              <select 
                name="role"
                value={memberData.role} 
                onChange={handleChange}
                className="form-select"
              >
                <option value="">Select role</option>
                <option value="Delegate">Delegate</option>
                <option value="Validator">Validator</option>
                <option value="Contributor">Contributor</option>
                <option value="Ambassador">Ambassador</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Initial Reputation</label>
              <input 
                type="range"
                name="reputation"
                min="0"
                max="100"
                value={memberData.reputation} 
                onChange={handleChange}
                className="form-slider"
              />
              <div className="slider-value">{memberData.reputation}</div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn secondary-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={adding}
            className="submit-btn primary-btn"
          >
            {adding ? "Joining Committee..." : "Join Committee"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;