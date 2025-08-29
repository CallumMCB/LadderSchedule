"use client";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { LinkIcon, Trash2 } from "lucide-react";

export default function ProfilePage() {
  const { data: session, update } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  
  // Password reset state
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Partner management state
  const [linkedPartnerEmail, setLinkedPartnerEmail] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [partnerLinked, setPartnerLinked] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<{email: string, name?: string}[]>([]);
  
  // Delete confirmation state
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  
  // Ladder management state
  const [ladderInfo, setLadderInfo] = useState<{
    currentLadder?: { id: string; name: string; number: number; endDate: string };
    allLadders: Array<{ id: string; name: string; number: number; endDate: string }>;
  }>({ allLadders: [] });
  const [selectedLadderId, setSelectedLadderId] = useState("");
  
  // Create new ladder state
  const [showCreateLadder, setShowCreateLadder] = useState(false);
  const [newLadderName, setNewLadderName] = useState("");
  const [newLadderEndDate, setNewLadderEndDate] = useState("");
  
  // Ladder winner settings
  const [ladderWinnerBy, setLadderWinnerBy] = useState<'matches' | 'games'>('matches');

  useEffect(() => {
    if (session?.user) {
      setName(session.user.name || "");
      setEmail(session.user.email || "");
      loadUserProfile();
      loadPartnerInfo();
      loadAvailableUsers();
      loadLadderInfo();
    }
  }, [session]);

  async function loadUserProfile() {
    try {
      const response = await fetch('/api/profile/info');
      if (response.ok) {
        const data = await response.json();
        setPhone(data.phone || "");
      }
    } catch (error) {
      console.error("Failed to load profile:", error);
    }
  }

  async function loadPartnerInfo() {
    try {
      const response = await fetch('/api/partner/info');
      if (response.ok) {
        const data = await response.json();
        if (data.partnerEmail) {
          setPartnerEmail(data.partnerEmail);
          setPartnerLinked(true);
        }
      }
    } catch (error) {
      console.error("Failed to load partner info:", error);
    }
  }

  async function loadAvailableUsers() {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setAvailableUsers(data.users || []);
      }
    } catch (error) {
      console.error("Failed to load users:", error);
    }
  }

  async function loadLadderInfo() {
    try {
      const response = await fetch('/api/ladders');
      if (response.ok) {
        const data = await response.json();
        setLadderInfo(data);
        setSelectedLadderId(data.currentLadder?.id || "");
      }
    } catch (error) {
      console.error("Failed to load ladder info:", error);
    }
  }

  async function updateLadder() {
    if (!selectedLadderId || selectedLadderId === ladderInfo.currentLadder?.id) return;
    
    setLoading(true);
    
    try {
      const response = await fetch('/api/ladder/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          newLadderId: selectedLadderId
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setMessage("Ladder switched successfully! All previous data cleared.");
        await loadLadderInfo(); // Reload to get updated info
        setTimeout(() => setMessage(""), 3000);
      } else {
        setMessage(data.error || "Failed to switch ladder");
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (error) {
      setMessage("Network error");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setLoading(false);
    }
  }

  async function createNewLadder(e: React.FormEvent) {
    e.preventDefault();
    if (!newLadderName.trim() || !newLadderEndDate) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/ladders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newLadderName.trim(),
          endDate: newLadderEndDate
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setMessage(`Ladder "${newLadderName}" created successfully! You've been assigned to it.`);
        await loadLadderInfo(); // Reload to get updated info
        setShowCreateLadder(false);
        setNewLadderName("");
        setNewLadderEndDate("");
        setTimeout(() => setMessage(""), 4000);
      } else {
        setMessage(data.error || "Failed to create ladder");
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (error) {
      setMessage("Network error");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setLoading(false);
    }
  }

  async function updateProfile(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone }),
      });

      if (response.ok) {
        setMessage("Profile updated successfully!");
        await update(); // Refresh session
        setTimeout(() => setMessage(""), 3000);
      } else {
        const error = await response.json();
        setMessage(error.error || "Failed to update profile");
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (error) {
      setMessage("Network error");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setLoading(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage("New passwords don't match");
      setTimeout(() => setMessage(""), 3000);
      return;
    }
    
    if (newPassword.length < 6) {
      setMessage("New password must be at least 6 characters");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/profile/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          currentPassword, 
          newPassword 
        }),
      });
      
      if (response.ok) {
        setMessage("Password changed successfully!");
        setShowPasswordReset(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setMessage(""), 3000);
      } else {
        const error = await response.json();
        setMessage(error.error || "Failed to change password");
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (error) {
      setMessage("Network error");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setLoading(false);
    }
  }

  async function linkPartner() {
    if (!linkedPartnerEmail) return;
    setLoading(true);
    try {
      const response = await fetch('/api/partner/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerEmail: linkedPartnerEmail }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setPartnerLinked(true);
        setPartnerEmail(linkedPartnerEmail);
        
        // Reload ladder info in case we switched ladders
        await loadLadderInfo();
        
        setMessage(data.message || "Partner linked successfully!");
        setTimeout(() => setMessage(""), 3000);
      } else {
        const error = await response.json();
        setMessage(error.error || "Failed to link partner");
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (error) {
      setMessage("Network error");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setLoading(false);
    }
  }

  async function unlinkPartner() {
    setLoading(true);
    try {
      const response = await fetch('/api/partner/unlink', {
        method: 'POST',
      });
      
      if (response.ok) {
        setPartnerLinked(false);
        setPartnerEmail("");
        setLinkedPartnerEmail("");
        setMessage("Partner unlinked successfully!");
        setTimeout(() => setMessage(""), 3000);
      } else {
        const error = await response.json();
        setMessage(error.error || "Failed to unlink partner");
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (error) {
      setMessage("Network error");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setLoading(false);
    }
  }

  async function deleteAccount() {
    if (deleteConfirmText !== "DELETE") {
      setMessage("Please type DELETE to confirm");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/profile/delete', {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setMessage("Account deleted successfully. Signing you out...");
        setTimeout(() => {
          signOut({ callbackUrl: "/login" });
        }, 2000);
      } else {
        const error = await response.json();
        setMessage(error.error || "Failed to delete account");
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (error) {
      setMessage("Network error");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setLoading(false);
    }
  }

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold mb-4">Please log in</h2>
            <p className="text-muted-foreground">You need to be logged in to view your profile.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <Card>
        <CardContent className="p-6">
          <h2 className="text-2xl font-semibold mb-6">Profile Settings</h2>
          <form onSubmit={updateProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <Input 
                value={email} 
                disabled
                className="bg-gray-50"
              />
              <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <Input 
                value={name} 
                onChange={(e) => setName(e.target.value)}
                placeholder="Your display name"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Phone Number</label>
              <Input 
                value={phone} 
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Your phone number (optional)"
                type="tel"
              />
              <p className="text-xs text-gray-500 mt-1">Used for opponent contact information</p>
            </div>
            
            {message && (
              <div className={`text-sm p-3 rounded ${message.includes('success') || message.includes('deleted') ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                {message}
              </div>
            )}
            
            <div className="flex gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? "Updating..." : "Update Profile"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Password Management */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-4">Password Settings</h3>
          
          {!showPasswordReset ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Change your account password.</p>
              <Button 
                onClick={() => setShowPasswordReset(true)}
                variant="outline"
              >
                Change Password
              </Button>
            </div>
          ) : (
            <form onSubmit={changePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Current Password</label>
                <Input 
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">New Password</label>
                <Input 
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 6 characters)"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Confirm New Password</label>
                <Input 
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  required
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  type="submit"
                  disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                >
                  {loading ? "Changing..." : "Change Password"}
                </Button>
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => {
                    setShowPasswordReset(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Ladder Management */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-4">Ladder Assignment</h3>
          
          <div className="space-y-4">
            {ladderInfo.currentLadder && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Current Ladder:</strong> {ladderInfo.currentLadder.name}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Ends: {new Date(ladderInfo.currentLadder.endDate).toLocaleDateString()}
                </p>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium mb-2">
                Select Ladder
              </label>
              {!showCreateLadder ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <select 
                      value={selectedLadderId} 
                      onChange={(e) => setSelectedLadderId(e.target.value)}
                      className="flex-1 h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10"
                    >
                      <option value="">Select a ladder...</option>
                      {ladderInfo.allLadders.map(ladder => (
                        <option key={ladder.id} value={ladder.id}>
                          {ladder.name} (Ends: {new Date(ladder.endDate).toLocaleDateString()})
                        </option>
                      ))}
                    </select>
                    <Button 
                      onClick={updateLadder} 
                      disabled={!selectedLadderId || selectedLadderId === ladderInfo.currentLadder?.id || loading}
                      variant="outline"
                    >
                      {loading ? "Updating..." : "Join"}
                    </Button>
                  </div>
                  <div className="text-center">
                    <Button 
                      onClick={() => setShowCreateLadder(true)}
                      variant="outline"
                      className="text-sm"
                    >
                      + Create New Ladder
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={createNewLadder} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Ladder Name</label>
                    <Input 
                      value={newLadderName} 
                      onChange={(e) => setNewLadderName(e.target.value)}
                      placeholder="e.g., Summer League 2025"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">End Date</label>
                    <Input 
                      type="date"
                      value={newLadderEndDate} 
                      onChange={(e) => setNewLadderEndDate(e.target.value)}
                      required
                      min={new Date().toISOString().split('T')[0]} // Today or later
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      type="submit"
                      disabled={!newLadderName.trim() || !newLadderEndDate || loading}
                    >
                      {loading ? "Creating..." : "Create & Join Ladder"}
                    </Button>
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowCreateLadder(false);
                        setNewLadderName("");
                        setNewLadderEndDate("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
              <p className="text-xs text-gray-500 mt-1">
                ⚠️ <strong>Warning:</strong> Changing ladders will clear all your matches, availability, and scores. You and your partner will be moved to the new ladder as a fresh team.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ladder Winner Settings */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-4">Ladder Winner Settings</h3>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Choose how the ladder winner is determined at the end of the season.
            </p>
            
            <div>
              <label className="block text-sm font-medium mb-2">Winner Determined By</label>
              <select
                value={ladderWinnerBy}
                onChange={(e) => setLadderWinnerBy(e.target.value as 'matches' | 'games')}
                className="w-full p-2 border rounded-lg"
              >
                <option value="matches">Number of Matches Won</option>
                <option value="games">Total Games Won (for single-set matches)</option>
              </select>
            </div>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
              <div className="font-medium text-yellow-900 mb-1">Note:</div>
              <div className="text-yellow-800">
                {ladderWinnerBy === 'matches' ? (
                  "Winner will be the team with the most match victories. Best for multi-set matches."
                ) : (
                  "Winner will be the team with the most total games won. Best for single-set matches where game count matters more."
                )}
              </div>
            </div>
            
            <Button 
              onClick={() => {
                setMessage("Ladder winner settings updated!");
                setTimeout(() => setMessage(""), 3000);
              }}
              disabled={loading}
            >
              Save Winner Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Partner Management */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-4">Partner Management</h3>
          
          {!partnerLinked ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Link with another player to form a doubles team.</p>
              <div className="flex gap-2">
                <select 
                  value={linkedPartnerEmail} 
                  onChange={(e) => setLinkedPartnerEmail(e.target.value)}
                  className="flex-1 h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10"
                >
                  <option value="">Select existing partner...</option>
                  {availableUsers.map(user => (
                    <option key={user.email} value={user.email}>
                      {user.name || user.email}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-gray-500 self-center">or</span>
                <Input 
                  placeholder="New partner email"
                  value={linkedPartnerEmail.includes('@') && !availableUsers.find(u => u.email === linkedPartnerEmail) ? linkedPartnerEmail : ''}
                  onChange={(e) => setLinkedPartnerEmail(e.target.value)}
                  className="flex-1"
                />
              </div>
              <Button onClick={linkPartner} disabled={!linkedPartnerEmail || loading}>
                <LinkIcon className="h-4 w-4 mr-2" />
                {availableUsers.find(u => u.email === linkedPartnerEmail) ? 'Link Partner' : 'Add Partner (Placeholder)'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Current Partner</p>
                  <p className="text-sm text-gray-600">{partnerEmail}</p>
                </div>
                <Button variant="outline" onClick={unlinkPartner} disabled={loading}>
                  Unlink Partner
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Account Deletion */}
      <Card className="border-red-200">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-4 text-red-700">Danger Zone</h3>
          
          {!showDeleteConfirmation ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
              <Button 
                variant="outline" 
                onClick={() => setShowDeleteConfirmation(true)}
                className="border-red-200 text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Account
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded">
                <p className="text-sm text-red-800 font-medium mb-2">⚠️ This will permanently delete your account</p>
                <p className="text-sm text-red-700">
                  All your availability data, match history, and team partnerships will be lost forever.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1 text-red-700">
                  Type "DELETE" to confirm
                </label>
                <Input 
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="border-red-300"
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={deleteAccount}
                  disabled={deleteConfirmText !== "DELETE" || loading}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {loading ? "Deleting..." : "Permanently Delete Account"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowDeleteConfirmation(false);
                    setDeleteConfirmText("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}