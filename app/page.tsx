"use client";
import React, { useMemo, useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, LinkIcon, CheckCircle2, XCircle } from "lucide-react";

const HALF_HOUR_MINUTES = [0, 30];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfWeekMonday(d: Date) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function timeLabel(h: number, m: number) {
  const ampm = h >= 12 ? "pm" : "am";
  const hh = ((h + 11) % 12) + 1;
  const mm = m.toString().padStart(2, "0");
  return `${hh}:${mm} ${ampm}`;
}

function isoAt(date: Date, hour: number, minute: number) {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function buildSlotsForWeek(weekStart: Date) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return { days };
}

export default function TennisLadderScheduler() {
  const { data: session } = useSession();
  const [partnerEmail, setPartnerEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [teamsData, setTeamsData] = useState<{
    teams: Array<{
      id: string;
      member1: { id: string; email: string; name?: string; availability: string[]; setByUserIds: string[] };
      member2?: { id: string; email: string; name?: string; availability: string[]; setByUserIds: string[] };
      color: string;
      isComplete?: boolean;
      lookingForPartner?: boolean;
    }>;
    myTeamId?: string;
    currentUserId?: string;
    matches?: Array<{
      id: string;
      startAt: string;
      team1Id: string;
      team2Id: string;
      team1Score?: number;
      team2Score?: number;
      completed?: boolean;
    }>;
  }>({ teams: [] });
  
  const [ladderInfo, setLadderInfo] = useState<{
    currentLadder?: { id: string; name: string; number: number; endDate: string };
    allLadders: Array<{ id: string; name: string; number: number; endDate: string }>;
  }>({ allLadders: [] });
  const [ladderInfoLoaded, setLadderInfoLoaded] = useState(false);

  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [myAvail, setMyAvail] = useState<Set<string>>(new Set());
  const [myUnavail, setMyUnavail] = useState<Set<string>>(new Set());
  const [partnerAvail, setPartnerAvail] = useState<Set<string>>(new Set());
  const [partnerAvailSetByMe, setPartnerAvailSetByMe] = useState<Set<string>>(new Set());
  const [proxyAvail, setProxyAvail] = useState<Set<string>>(new Set()); // For when acting on behalf
  const [proxyUnavail, setProxyUnavail] = useState<Set<string>>(new Set()); // Proxy unavailable state
  const [teamProxyStates, setTeamProxyStates] = useState<Record<string, { avail: Set<string>; unavail: Set<string> }>>({});
  const [showMatchConfirmation, setShowMatchConfirmation] = useState<{
    slot: string;
    opponent?: { id: string; name: string; color: string };
    opponents?: Array<{ id: string; name: string; color: string }>;
  } | null>(null);
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const [actingAsTeam, setActingAsTeam] = useState<string | null>(null);
  const [actingAsPlayer, setActingAsPlayer] = useState<string | null>(null);
  
  // Selection state
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [showBulkActionModal, setShowBulkActionModal] = useState(false);
  const [isBlockSelectMode, setIsBlockSelectMode] = useState(false);
  const [blockSelectCorners, setBlockSelectCorners] = useState<string[]>([]);
  
  // Undo state
  const [undoStack, setUndoStack] = useState<Array<{
    myAvail: Set<string>;
    myUnavail: Set<string>;
    partnerAvail: Set<string>;
    partnerAvailSetByMe: Set<string>;
  }>>([]);

  const teamAvail = useMemo(() => {
    const s = new Set<string>();
    myAvail.forEach(k => { if (partnerAvail.has(k)) s.add(k); });
    return s;
  }, [myAvail, partnerAvail]);

  const { days } = useMemo(() => buildSlotsForWeek(weekStart), [weekStart]);

  // Load availability data when component mounts or week changes
  useEffect(() => {
    if (session) {
      loadLadderInfo();
    }
  }, [session]);

  useEffect(() => {
    if (session && ladderInfo?.currentLadder) {
      loadAllMembersAvailability();
    }
  }, [session, weekStart, ladderInfo?.currentLadder?.id]);

  // Global mouse up handler for drag selection


  // Selection helper functions
  function parseSlotKey(key: string): { day: number; hour: number; minute: number } {
    const date = new Date(key);
    const weekStartTime = startOfWeekMonday(date);
    const dayOfWeek = Math.floor((date.getTime() - weekStartTime.getTime()) / (24 * 60 * 60 * 1000));
    return {
      day: dayOfWeek,
      hour: date.getHours(),
      minute: date.getMinutes()
    };
  }

  function createSlotKey(day: number, hour: number, minute: number): string {
    const targetDay = addDays(weekStart, day);
    return isoAt(targetDay, hour, minute);
  }

  function getSlotsBetween(start: string, end: string): Set<string> {
    const slots = new Set<string>();
    const startParsed = parseSlotKey(start);
    const endParsed = parseSlotKey(end);
    
    // Get the rectangular bounds
    const minDay = Math.min(startParsed.day, endParsed.day);
    const maxDay = Math.max(startParsed.day, endParsed.day);
    const minHour = Math.min(startParsed.hour, endParsed.hour);
    const maxHour = Math.max(startParsed.hour, endParsed.hour);
    const minMinute = Math.min(startParsed.minute, endParsed.minute);
    const maxMinute = Math.max(startParsed.minute, endParsed.minute);

    // For each day in the range
    for (let day = minDay; day <= maxDay; day++) {
      // For each hour in the time range
      for (let hour = minHour; hour <= maxHour; hour++) {
        // Check both 0 and 30 minute slots
        for (let minute of [0, 30]) {
          // Include this slot if the minute falls within the minute range
          // OR if we're spanning multiple hours (then include all minutes)
          const includeSlot = minHour === maxHour ? 
            (minute >= minMinute && minute <= maxMinute) : 
            (hour === minHour ? minute >= minMinute : 
             hour === maxHour ? minute <= maxMinute : 
             true); // middle hours get all minutes
          
          if (includeSlot) {
            const slotKey = createSlotKey(day, hour, minute);
            const slotTime = new Date(slotKey);
            
            // Check if slot is not in the past
            if (slotTime >= new Date()) {
              slots.add(slotKey);
            }
          }
        }
      }
    }
    
    return slots;
  }

  function handleBlockSelectClick(key: string) {
    const slotTime = new Date(key);
    if (slotTime < new Date()) return; // Don't select past times
    
    // If we already have corners selected, this is the second corner
    if (blockSelectCorners.length === 1) {
      const newCorners = [...blockSelectCorners, key];
      setBlockSelectCorners(newCorners);
      
      // Calculate selection between corners
      const slotsInRange = getSlotsBetween(newCorners[0], newCorners[1]);
      setSelectedSlots(slotsInRange);
      setShowBulkActionModal(true);
      setBlockSelectCorners([]);
    } else {
      // This is the first corner
      setBlockSelectCorners([key]);
      setSelectedSlots(new Set());
    }
  }


  function saveStateForUndo() {
    setUndoStack(prev => {
      const newStack = [...prev, {
        myAvail: new Set(myAvail),
        myUnavail: new Set(myUnavail),
        partnerAvail: new Set(partnerAvail),
        partnerAvailSetByMe: new Set(partnerAvailSetByMe)
      }];
      // Keep only last 10 undo states
      return newStack.slice(-10);
    });
  }

  function performUndo() {
    if (undoStack.length === 0) return;
    
    const lastState = undoStack[undoStack.length - 1];
    setMyAvail(new Set(lastState.myAvail));
    setMyUnavail(new Set(lastState.myUnavail));
    setPartnerAvail(new Set(lastState.partnerAvail));
    setPartnerAvailSetByMe(new Set(lastState.partnerAvailSetByMe));
    
    // Remove the used state from undo stack
    setUndoStack(prev => prev.slice(0, -1));
  }

  function clearAllUnconfirmed() {
    // Save current state for undo
    saveStateForUndo();
    
    // Get all confirmed match slots
    const confirmedSlots = new Set(teamsData.matches?.map(m => m.startAt) || []);
    
    // Clear only unconfirmed availability
    setMyAvail(prev => {
      const filtered = new Set<string>();
      prev.forEach(slot => {
        if (confirmedSlots.has(slot)) {
          filtered.add(slot);
        }
      });
      return filtered;
    });
    
    // Also clear unavailable slots since those are preferences
    setMyUnavail(new Set());
    
    // Clear only partner availability that I set, preserve what they set themselves
    const partnerSlotsISet = new Set(partnerAvailSetByMe); // Capture current state before clearing
    setPartnerAvailSetByMe(new Set());
    setPartnerAvail(prev => {
      const filtered = new Set<string>();
      prev.forEach(slot => {
        // Keep slots that are confirmed OR that I didn't set (i.e., they set themselves)
        if (confirmedSlots.has(slot) || !partnerSlotsISet.has(slot)) {
          filtered.add(slot);
        }
        // Remove slots that I set and are unconfirmed
      });
      return filtered;
    });
  }

  function applyBulkAction(action: 'available' | 'unavailable' | 'both-available' | 'clear') {
    // Save state for undo before making changes
    saveStateForUndo();
    
    const slots = Array.from(selectedSlots);
    
    if (actingAsTeam) {
      // Apply to proxy state when acting on behalf
      slots.forEach(slot => {
        if (action === 'available') {
          setProxyAvail(prev => new Set(prev).add(slot));
          setProxyUnavail(prev => {
            const next = new Set(prev);
            next.delete(slot);
            return next;
          });
        } else if (action === 'unavailable') {
          setProxyAvail(prev => {
            const next = new Set(prev);
            next.delete(slot);
            return next;
          });
          setProxyUnavail(prev => new Set(prev).add(slot));
        } else if (action === 'both-available') {
          setProxyAvail(prev => new Set(prev).add(slot));
          setProxyUnavail(prev => {
            const next = new Set(prev);
            next.delete(slot);
            return next;
          });
        } else if (action === 'clear') {
          setProxyAvail(prev => {
            const next = new Set(prev);
            next.delete(slot);
            return next;
          });
          setProxyUnavail(prev => {
            const next = new Set(prev);
            next.delete(slot);
            return next;
          });
        }
      });
    } else {
      // Apply to my own state
      slots.forEach(slot => {
        if (action === 'available') {
          setMyAvail(prev => new Set(prev).add(slot));
          setMyUnavail(prev => {
            const next = new Set(prev);
            next.delete(slot);
            return next;
          });
        } else if (action === 'unavailable') {
          setMyAvail(prev => {
            const next = new Set(prev);
            next.delete(slot);
            return next;
          });
          setMyUnavail(prev => new Set(prev).add(slot));
        } else if (action === 'both-available') {
          setMyAvail(prev => new Set(prev).add(slot));
          setMyUnavail(prev => {
            const next = new Set(prev);
            next.delete(slot);
            return next;
          });
          setPartnerAvail(prev => new Set(prev).add(slot));
          setPartnerAvailSetByMe(prev => new Set(prev).add(slot));
        } else if (action === 'clear') {
          setMyAvail(prev => {
            const next = new Set(prev);
            next.delete(slot);
            return next;
          });
          setMyUnavail(prev => {
            const next = new Set(prev);
            next.delete(slot);
            return next;
          });
          setPartnerAvail(prev => {
            const next = new Set(prev);
            next.delete(slot);
            return next;
          });
          setPartnerAvailSetByMe(prev => {
            const next = new Set(prev);
            next.delete(slot);
            return next;
          });
        }
      });
    }
    
    // Close modal and clear selection
    setShowBulkActionModal(false);
    setSelectedSlots(new Set());
  }

  function toggleMySlot(key: string) {
    // Check if this is a past time - if so, don't allow changes
    const slotTime = new Date(key);
    const now = new Date();
    if (slotTime < now) {
      return; // Don't allow changes to past times
    }

    // Check if ladder has ended - if so, don't allow changes
    const ladderEndDate = ladderInfo?.currentLadder ? new Date(ladderInfo.currentLadder.endDate) : null;
    if (ladderEndDate && slotTime >= ladderEndDate) {
      return; // Don't allow changes after ladder end date
    }

    // Save state for undo before making changes
    saveStateForUndo();

    if (actingAsTeam) {
      // When acting on behalf, update proxy state with three-state cycle
      const isAvailable = proxyAvail.has(key);
      const isUnavailable = proxyUnavail.has(key);
      console.log('Acting on behalf - slot:', key, 'current proxy state:', { isAvailable, isUnavailable });
      
      if (!isAvailable && !isUnavailable) {
        // Normal → Available
        setProxyAvail(prev => new Set(prev).add(key));
      } else if (isAvailable && !isUnavailable) {
        // Available → Unavailable 
        setProxyAvail(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setProxyUnavail(prev => new Set(prev).add(key));
      } else {
        // Unavailable → Normal
        setProxyUnavail(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    } else {
      // Normal behavior for my own team
      const isAvailable = myAvail.has(key);
      const isUnavailable = myUnavail.has(key);
      
      if (!isAvailable && !isUnavailable) {
        // Normal → Available
        setMyAvail(prev => {
          const newSet = new Set(prev).add(key);
          // Check for matches if both team members are available
          if (partnerAvail.has(key)) {
            setTimeout(() => checkForMatches(key, true, true), 100);
          }
          return newSet;
        });
      } else if (isAvailable && !isUnavailable) {
        // Available → Unavailable
        setMyAvail(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setMyUnavail(prev => new Set(prev).add(key));
      } else {
        // Unavailable → Normal
        setMyUnavail(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    }
  }

  function handleDoubleClick(key: string) {
    // Check if this is a past time - if so, don't allow changes
    const slotTime = new Date(key);
    const now = new Date();
    if (slotTime < now) {
      return; // Don't allow changes to past times
    }

    // Save state for undo before making changes
    saveStateForUndo();

    if (actingAsTeam) {
      // When acting on behalf, set both available or clear both
      const isAvailable = proxyAvail.has(key);
      
      if (isAvailable) {
        // Remove available state and clear unavailable as well
        setProxyAvail(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setProxyUnavail(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      } else {
        // Set both as available and clear unavailable
        setProxyAvail(prev => new Set(prev).add(key));
        setProxyUnavail(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    } else {
      // Normal behavior for my own team
      // If I previously set my partner as available, remove it
      if (partnerAvailSetByMe.has(key)) {
        setPartnerAvail(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setPartnerAvailSetByMe(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      } else {
        // Set both me and partner as available
        setMyAvail(prev => new Set(prev).add(key));
        setMyUnavail(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setPartnerAvail(prev => new Set(prev).add(key));
        setPartnerAvailSetByMe(prev => new Set(prev).add(key));
        // Check for matches after setting both as available
        setTimeout(() => checkForMatches(key, true, true), 150);
      }
    }
  }


  function checkForMatches(slotKey: string, forceMyAvailable?: boolean, forcePartnerAvailable?: boolean) {
    // Need to check updated state, so use a small delay to let state update
    const checkMatches = () => {
      const iAvailable = forceMyAvailable !== undefined ? forceMyAvailable : myAvail.has(slotKey);
      const partnerAvailable = forcePartnerAvailable !== undefined ? forcePartnerAvailable : partnerAvail.has(slotKey);
      const myTeamAvailable = iAvailable && partnerAvailable;
      
      console.log('Checking matches for slot:', slotKey);
      console.log('My available:', iAvailable, 'Partner available:', partnerAvailable, 'Team available:', myTeamAvailable);
      console.log('Teams data:', teamsData.teams.length, 'teams');
      
      if (!myTeamAvailable) {
        console.log('My team not fully available, skipping match check');
        return;
      }

      // Find other teams that are available for this slot
      const availableTeams = teamsData.teams.filter(team => {
        if (team.id === teamsData.myTeamId) return false; // Skip my team
        
        const member1Available = team.member1.availability.includes(slotKey);
        const member2Available = team.member2?.availability.includes(slotKey) || false;
        const teamAvailable = member1Available && member2Available;
        
        console.log(`Team ${team.id}: member1=${member1Available}, member2=${member2Available}, teamAvailable=${teamAvailable}`);
        return teamAvailable;
      });

      console.log('Available opposing teams:', availableTeams.length);

      if (availableTeams.length === 1) {
      // Exactly one other team available - show direct confirmation
      const opponent = availableTeams[0];
      setShowMatchConfirmation({
        slot: slotKey,
        opponent: {
          id: opponent.id,
          name: `${opponent.member1.name || opponent.member1.email}${
            opponent.member2 && opponent.member2.id !== opponent.member1.id 
              ? ` & ${opponent.member2.name || opponent.member2.email}` 
              : ''
          }`,
          color: opponent.color
        }
      });
    } else if (availableTeams.length > 1) {
      // Multiple teams available - show selection
      setShowMatchConfirmation({
        slot: slotKey,
        opponents: availableTeams.map(team => ({
          id: team.id,
          name: `${team.member1.name || team.member1.email}${
            team.member2 && team.member2.id !== team.member1.id 
              ? ` & ${team.member2.name || team.member2.email}` 
              : ''
          }`,
          color: team.color
        }))
      });
      }
    };
    
    // Call with a slight delay to ensure state has updated
    setTimeout(checkMatches, 100);
  }

  // Note: Match checking is now done in toggleMySlot and handleDoubleClick


  async function saveAvailability() {
    setSaving(true);
    try {
      if (actingAsTeam && actingAsPlayer) {
        // Acting as specific player in another team
        const response = await fetch('/api/availability/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weekStartISO: weekStart.toISOString(),
            availableSlots: Array.from(proxyAvail),
            unavailableSlots: Array.from(proxyUnavail),
            targetUserId: actingAsPlayer,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setSaveMsg(`Saved for ${data.message?.split(' ').slice(-1) || 'player'}!`);
          // Update saved state in teamProxyStates
          if (actingAsTeam) {
            setTeamProxyStates(prev => ({
              ...prev,
              [actingAsTeam]: {
                avail: new Set(),
                unavail: new Set()
              }
            }));
          }
          // Clear proxy state after successful save
          setProxyAvail(new Set());
          setProxyUnavail(new Set());
          // Only reload teams data, not my own availability to preserve unsaved changes
          await loadTeamsAvailability();
          setTimeout(() => setSaveMsg(""), 2000);
        } else {
          const error = await response.json();
          setSaveMsg(error.error || "Failed to save");
          setTimeout(() => setSaveMsg(""), 3000);
        }
      } else if (actingAsTeam && !actingAsPlayer) {
        // Acting for both players in another team
        console.log('Saving for both players, proxy state:', { 
          proxyAvail: Array.from(proxyAvail), 
          proxyUnavail: Array.from(proxyUnavail) 
        });
        const team = teamsData.teams.find(t => t.id === actingAsTeam);
        if (team) {
          const promises = [
            fetch('/api/availability/proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                weekStartISO: weekStart.toISOString(),
                availableSlots: Array.from(proxyAvail),
                unavailableSlots: Array.from(proxyUnavail),
                targetUserId: team.member1.id,
              }),
            })
          ];
          
          if (team.member2 && team.member2.id !== team.member1.id) {
            promises.push(
              fetch('/api/availability/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  weekStartISO: weekStart.toISOString(),
                  availableSlots: Array.from(proxyAvail),
                  unavailableSlots: Array.from(proxyUnavail),
                  targetUserId: team.member2.id,
                }),
              })
            );
          }

          const responses = await Promise.all(promises);
          const allSuccess = responses.every(r => r.ok);
          
          if (allSuccess) {
            setSaveMsg("Saved for both team members!");
            // Update saved state in teamProxyStates but keep current proxy state
            if (actingAsTeam) {
              setTeamProxyStates(prev => ({
                ...prev,
                [actingAsTeam]: {
                  avail: new Set(),
                  unavail: new Set()
                }
              }));
            }
            // Clear current proxy state after successful save
            setProxyAvail(new Set());
            setProxyUnavail(new Set());
            // Only reload teams data, not my own availability to preserve unsaved changes
            await loadTeamsAvailability();
            setTimeout(() => setSaveMsg(""), 2000);
          } else {
            setSaveMsg("Some saves failed");
            setTimeout(() => setSaveMsg(""), 3000);
          }
        }
      } else {
        // Normal save for my own availability
        const promises = [
          fetch('/api/availability', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              weekStartISO: weekStart.toISOString(),
              slots: Array.from(myAvail),
            }),
          })
        ];

        // Also save partner availability that I set
        if (partnerAvailSetByMe.size > 0) {
          const myTeam = teamsData.teams.find(t => t.id === teamsData.myTeamId);
          const partnerId = myTeam?.member2?.id !== myTeam?.member1?.id ? myTeam?.member2?.id : null;
          if (partnerId) {
            promises.push(
              fetch('/api/availability/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  weekStartISO: weekStart.toISOString(),
                  availableSlots: Array.from(partnerAvailSetByMe),
                  unavailableSlots: [], // Partner unavailable slots would be handled separately if needed
                  targetUserId: partnerId,
                }),
              })
            );
          }
        }

        const responses = await Promise.all(promises);
        const allSuccess = responses.every(r => r.ok);

        if (allSuccess) {
          setSaveMsg("Saved successfully!");
          // Clear any team proxy states since we've saved our own data
          setTeamProxyStates({});
          await loadAllMembersAvailability();
          setTimeout(() => setSaveMsg(""), 2000);
        } else {
          setSaveMsg("Some saves failed");
          setTimeout(() => setSaveMsg(""), 3000);
        }
      }
    } catch (error) {
      setSaveMsg("Network error");
      setTimeout(() => setSaveMsg(""), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function loadTeamsAvailability() {
    try {
      // Load all teams' availability for the user's current ladder
      const ladderId = ladderInfo?.currentLadder?.id;
      console.log('Calendar weekStart state:', weekStart);
      console.log('Current date:', new Date());
      console.log('Expected week start (Monday):', startOfWeekMonday(new Date()));
      // Fix timezone issue by creating a proper Monday date in UTC
      const weekStartUTC = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
      const weekStartISO = weekStartUTC.toISOString();
      console.log('Original weekStart:', weekStart);
      console.log('UTC weekStart:', weekStartUTC);  
      console.log('Sending weekStart ISO:', weekStartISO);
      const url = `/api/teams/availability?weekStart=${weekStartISO}${ladderId ? `&ladderId=${ladderId}` : ''}`;
      const teamsResponse = await fetch(url);
      if (teamsResponse.ok) {
        const teamsData = await teamsResponse.json();
        console.log('Loaded teams data:', teamsData);
        console.log('Matches found:', teamsData.matches);
        console.log('Teams availability example:', teamsData.teams.slice(0, 2).map((t: any) => ({
          id: t.id,
          member1: { email: t.member1.email, availability: t.member1.availability.slice(0, 3), setByUserIds: t.member1.setByUserIds.slice(0, 3) },
          member2: t.member2 ? { email: t.member2.email, availability: t.member2.availability.slice(0, 3), setByUserIds: t.member2.setByUserIds.slice(0, 3) } : null
        })));
        setTeamsData(teamsData);
      }
    } catch (error) {
      console.error("Failed to load teams availability:", error);
    }
  }

  async function loadLadderInfo() {
    try {
      const response = await fetch('/api/ladders');
      if (response.ok) {
        const data = await response.json();
        setLadderInfo(data);
        setLadderInfoLoaded(true);
      }
    } catch (error) {
      console.error("Failed to load ladder info:", error);
      setLadderInfoLoaded(true); // Still mark as loaded even if failed
    }
  }

  async function loadAllMembersAvailability() {
    try {
      // Load my availability
      const myResponse = await fetch(`/api/availability?weekStart=${weekStart.toISOString()}`);
      if (myResponse.ok) {
        const data = await myResponse.json();
        setMyAvail(new Set(data.mySlots || []));
        setPartnerAvail(new Set(data.partnerSlots || []));
        if (data.partnerEmail) {
          setPartnerEmail(data.partnerEmail);
        }
      }

      // Load teams data too
      await loadTeamsAvailability();
    } catch (error) {
      console.error("Failed to load availability:", error);
    }
  }

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold mb-4">Please log in</h2>
            <p className="text-muted-foreground mb-4">You need to be logged in to access the scheduler.</p>
            <div className="space-y-2">
              <Button onClick={() => window.location.href = '/login'} className="w-full">
                Go to Login
              </Button>
              <p className="text-xs text-muted-foreground">
                Don't have an account?{' '}
                <a href="/register" className="text-blue-600 hover:underline">
                  Register here
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!ladderInfoLoaded) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold mb-4">Loading...</h2>
            <p className="text-muted-foreground">Loading ladder information...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!ladderInfo?.currentLadder) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold mb-4">No Ladder Assigned</h2>
            <p className="text-muted-foreground mb-4">
              You need to be assigned to a ladder to access the scheduler.
            </p>
            <a href="/profile" className="text-blue-600 underline">
              Go to Profile to select a ladder
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  const weekLabel = `${formatDate(days[0])} — ${formatDate(days[6])}`;
  
  // Check if current week is past the ladder end date
  const ladderEndDate = ladderInfo?.currentLadder ? new Date(ladderInfo.currentLadder.endDate) : null;
  const isAfterEndDate = ladderEndDate && weekStart >= ladderEndDate;
  
  const endDateLabel = ladderEndDate ? 
    `Ends: ${ladderEndDate.toLocaleDateString()}` : 
    'End date not set';

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Ladder Info Header */}
      {ladderInfo?.currentLadder && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold text-blue-900">
                {ladderInfo?.currentLadder?.name}
              </span>
              <span className="text-sm text-blue-700">{endDateLabel}</span>
            </div>
            {isAfterEndDate && (
              <span className="text-sm text-red-600 font-medium">
                ⚠️ Ladder has ended - calendar is read-only
              </span>
            )}
          </div>
        </div>
      )}

      {/* Teams Display */}
      {teamsData.teams.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-semibold mb-3">All Teams</h3>
            <div className="flex flex-wrap gap-3">
              {teamsData.teams.map((team) => (
                <div 
                  key={team.id} 
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border"
                  style={{ borderColor: team.color, backgroundColor: `${team.color}20` }}
                >
                  <div 
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: team.color }}
                  />
                  <div className="text-sm">
                    <div className="font-medium">
                      {team.member1.name || team.member1.email}
                      {team.member2 && team.member2.id !== team.member1.id && (
                        <> & {team.member2.name || team.member2.email}</>
                      )}
                      {team.lookingForPartner && <span className="text-gray-500 ml-1">(looking for partner)</span>}
                    </div>
                    {team.id === teamsData.myTeamId && (
                      <div className="text-xs text-blue-600">Your team</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Team/Player Selection for Acting On Behalf */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="font-medium">Act on behalf of:</span>
            <select 
              value={actingAsTeam || ""}
              onChange={(e) => {
                const newTeamId = e.target.value || null;
                const currentTeamId = actingAsTeam;
                
                // Save current proxy state before switching
                if (currentTeamId) {
                  setTeamProxyStates(prev => ({
                    ...prev,
                    [currentTeamId]: {
                      avail: new Set(proxyAvail),
                      unavail: new Set(proxyUnavail)
                    }
                  }));
                }
                
                setActingAsTeam(newTeamId);
                setActingAsPlayer(null);
                
                // Restore proxy state for new team or start with empty
                if (newTeamId && teamProxyStates[newTeamId]) {
                  setProxyAvail(new Set(teamProxyStates[newTeamId].avail));
                  setProxyUnavail(new Set(teamProxyStates[newTeamId].unavail));
                } else {
                  setProxyAvail(new Set());
                  setProxyUnavail(new Set());
                }
              }}
              className="h-8 px-2 rounded-lg border border-neutral-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
            >
              <option value="">My own team</option>
              {teamsData.teams.filter(team => team.id !== teamsData.myTeamId).map(team => (
                <option key={team.id} value={team.id}>
                  {team.member1.name || team.member1.email}
                  {team.member2 && team.member2.id !== team.member1.id && 
                    ` & ${team.member2.name || team.member2.email}`}
                  {team.lookingForPartner && " (solo)"}
                </option>
              ))}
            </select>
            
            {actingAsTeam && (
              <>
                <span>as:</span>
                <select 
                  value={actingAsPlayer || "both"}
                  onChange={(e) => setActingAsPlayer(e.target.value === "both" ? null : e.target.value)}
                  className="h-8 px-2 rounded-lg border border-neutral-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                >
                  <option value="both">Both players</option>
                  {(() => {
                    const team = teamsData.teams.find(t => t.id === actingAsTeam);
                    if (!team) return null;
                    return (
                      <>
                        <option value={team.member1.id}>
                          {team.member1.name || team.member1.email} only
                        </option>
                        {team.member2 && team.member2.id !== team.member1.id && (
                          <option value={team.member2.id}>
                            {team.member2.name || team.member2.email} only
                          </option>
                        )}
                      </>
                    );
                  })()}
                </select>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Week Navigation */}
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-medium whitespace-nowrap">{weekLabel}</div>
        <Button variant="outline" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>


      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <a href="/help" className="text-blue-600 hover:underline">
            Need help? View the visual guide →
          </a>
          {isBlockSelectMode && (
            <div className="flex items-center gap-2 ml-4 px-2 py-1 bg-blue-100 rounded">
              <span className="text-blue-800 font-medium">Block Select Mode</span>
              <span className="text-xs text-blue-600">
                {blockSelectCorners.length === 0 ? "Click first corner or drag to select" :
                 blockSelectCorners.length === 1 ? "Click second corner to complete rectangle" : ""}
              </span>
            </div>
          )}
        </div>
      </div>

      <AvailabilityGrid 
        days={days} 
        myAvail={myAvail} 
        myUnavail={myUnavail}
        partnerAvail={partnerAvail} 
        teamsData={teamsData}
        onToggle={toggleMySlot}
        onDoubleClick={handleDoubleClick}
        onCancelMatch={cancelMatch}
        onShowMatchConfirmation={setShowMatchConfirmation}
        actingAsTeam={actingAsTeam}
        actingAsPlayer={actingAsPlayer}
        proxyAvail={proxyAvail}
        proxyUnavail={proxyUnavail}
        selectedSlots={selectedSlots}
        blockSelectCorners={blockSelectCorners}
        isBlockSelectMode={isBlockSelectMode}
        onBlockSelectClick={handleBlockSelectClick}
        ladderInfo={ladderInfo}
      />

      <details>
        <summary className="cursor-pointer text-sm text-muted-foreground">Debug</summary>
        <pre className="text-xs bg-muted/50 p-3 rounded-xl overflow-auto">{JSON.stringify({
          weekStart,
          myAvail: Array.from(myAvail).slice(0, 5),
          partnerAvail: Array.from(partnerAvail).slice(0, 5),
          teamAvailCount: Array.from(teamAvail).length,
          matches: teamsData.matches,
          myTeamId: teamsData.myTeamId,
        }, null, 2)}</pre>
      </details>

      {/* Match Confirmation Popup */}
      {showMatchConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="max-w-md w-full mx-4">
            <CardContent className="p-6">
              {showMatchConfirmation.opponent ? (
                // Direct match confirmation
                <>
                  <h3 className="text-lg font-semibold mb-4">Confirm Match</h3>
                  <div className="mb-4">
                    <div className="text-sm text-gray-600 mb-2">Time slot:</div>
                    <div className="font-medium">{new Date(showMatchConfirmation.slot).toLocaleString()}</div>
                  </div>
                  <div className="mb-6">
                    <div className="text-sm text-gray-600 mb-2">Opponent team:</div>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: showMatchConfirmation.opponent.color }}
                      />
                      <span className="font-medium">{showMatchConfirmation.opponent.name}</span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button onClick={() => confirmMatch(showMatchConfirmation.opponent!.id)} className="flex-1">
                      Confirm Match
                    </Button>
                    <Button variant="outline" onClick={() => setShowMatchConfirmation(null)} className="flex-1">
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                // Team selection
                <>
                  <h3 className="text-lg font-semibold mb-4">Choose Opponent</h3>
                  <div className="mb-4">
                    <div className="text-sm text-gray-600 mb-2">Time slot:</div>
                    <div className="font-medium">{new Date(showMatchConfirmation.slot).toLocaleString()}</div>
                  </div>
                  <div className="mb-4">
                    <div className="text-sm text-gray-600 mb-2">Available teams:</div>
                    <div className="space-y-2">
                      {showMatchConfirmation.opponents?.map(opponent => (
                        <button
                          key={opponent.id}
                          onClick={() => confirmMatch(opponent.id)}
                          className="w-full p-3 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
                        >
                          <div 
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: opponent.color }}
                          />
                          <span>{opponent.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button variant="outline" onClick={() => setShowMatchConfirmation(null)} className="w-full">
                    Cancel
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bulk Action Modal */}
      {showBulkActionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="max-w-md w-full mx-4">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4">
                Bulk Action ({selectedSlots.size} slots)
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                What would you like to do with the selected time slots?
              </p>
              <div className="space-y-2">
                <Button 
                  onClick={() => applyBulkAction('available')}
                  className="w-full justify-start"
                  variant="outline"
                >
                  Mark as Available
                </Button>
                <Button 
                  onClick={() => applyBulkAction('unavailable')}
                  className="w-full justify-start"
                  variant="outline"
                >
                  Mark as Unavailable
                </Button>
                {!actingAsTeam && (
                  <Button 
                    onClick={() => applyBulkAction('both-available')}
                    className="w-full justify-start"
                    variant="outline"
                  >
                    Mark Both Partners as Available
                  </Button>
                )}
                <Button 
                  onClick={() => applyBulkAction('clear')}
                  className="w-full justify-start"
                  variant="outline"
                >
                  Clear All Selections
                </Button>
              </div>
              <div className="mt-4 pt-4 border-t">
                <Button 
                  onClick={() => {
                    setShowBulkActionModal(false);
                    setSelectedSlots(new Set());
                  }}
                  variant="outline"
                  className="w-full"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Clear All Unconfirmed Confirmation Modal */}
      {showClearConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="max-w-md w-full mx-4">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4 text-red-600">
                Clear All Unconfirmed Availability
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                This action will permanently clear all your unconfirmed availability slots and cannot be undone. 
                Confirmed matches will remain unchanged.
              </p>
              <p className="text-sm font-medium text-gray-800 mb-6">
                Are you sure you want to proceed?
              </p>
              <div className="flex gap-3">
                <Button 
                  onClick={() => {
                    clearAllUnconfirmed();
                    setShowClearConfirmation(false);
                  }}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  Yes, Clear All
                </Button>
                <Button 
                  onClick={() => setShowClearConfirmation(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sticky Save Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <div className="flex flex-col items-end gap-2">
          {saveMsg && (
            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-lg">
              <span className="text-sm text-muted-foreground">{saveMsg}</span>
            </div>
          )}
          <Button 
            onClick={() => {
              setIsBlockSelectMode(!isBlockSelectMode);
              setBlockSelectCorners([]);
              setSelectedSlots(new Set());
            }}
            variant={isBlockSelectMode ? "default" : "outline"}
            className="shadow-lg hover:shadow-xl transition-shadow"
          >
            {isBlockSelectMode ? "Exit Block Select" : "Block Select"}
          </Button>
          <Button 
            onClick={() => setShowClearConfirmation(true)}
            variant="outline"
            size="sm"
            className="mb-2"
          >
            Clear All Unconfirmed
          </Button>
          <Button 
            onClick={performUndo}
            variant="outline" 
            size="sm"
            disabled={undoStack.length === 0}
            className="mb-2"
          >
            Undo ({undoStack.length})
          </Button>
          <Button 
            onClick={saveAvailability} 
            disabled={saving || !!isAfterEndDate}
            className="shadow-lg hover:shadow-xl transition-shadow"
            size="lg"
          >
            {saving ? "Saving…" : isAfterEndDate ? "Ladder Ended" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );

  async function confirmMatch(opponentTeamId: string) {
    if (!showMatchConfirmation) return;
    
    try {
      const response = await fetch('/api/matches/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotKey: showMatchConfirmation.slot,
          opponentTeamId
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Match confirmation response:', data);
        setSaveMsg("Match confirmed successfully!");
        setShowMatchConfirmation(null);
        // Reload data to show the confirmed match
        console.log('Reloading data after match confirmation...');
        await loadAllMembersAvailability();
        setTimeout(() => setSaveMsg(""), 3000);
      } else {
        const error = await response.json();
        setSaveMsg(error.error || "Failed to confirm match");
        setTimeout(() => setSaveMsg(""), 3000);
      }
    } catch (error) {
      setSaveMsg("Network error");
      setTimeout(() => setSaveMsg(""), 3000);
    }
  }

  async function cancelMatch(matchId: string) {
    try {
      const response = await fetch('/api/matches/cancel', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId }),
      });

      if (response.ok) {
        await response.json();
        setSaveMsg("Match cancelled successfully!");
        // Reload data to remove the cancelled match
        await loadAllMembersAvailability();
        setTimeout(() => setSaveMsg(""), 3000);
      } else {
        const error = await response.json();
        setSaveMsg(error.error || "Failed to cancel match");
        setTimeout(() => setSaveMsg(""), 3000);
      }
    } catch (error) {
      setSaveMsg("Network error");
      setTimeout(() => setSaveMsg(""), 3000);
    }
  }
}

function AvailabilityGrid({ 
  days, 
  myAvail, 
  myUnavail,
  partnerAvail, 
  teamsData,
  onToggle,
  onDoubleClick,
  onCancelMatch,
  onShowMatchConfirmation,
  actingAsTeam,
  actingAsPlayer,
  proxyAvail,
  proxyUnavail,
  selectedSlots,
  blockSelectCorners,
  isBlockSelectMode,
  onBlockSelectClick,
  ladderInfo
}: { 
  days: Date[]; 
  myAvail: Set<string>; 
  myUnavail: Set<string>;
  partnerAvail: Set<string>; 
  teamsData: {
    teams: Array<{
      id: string;
      member1: { id: string; email: string; name?: string; availability: string[]; setByUserIds: string[] };
      member2?: { id: string; email: string; name?: string; availability: string[]; setByUserIds: string[] };
      color: string;
      isComplete?: boolean;
      lookingForPartner?: boolean;
    }>;
    myTeamId?: string;
    currentUserId?: string;
    matches?: Array<{
      id: string;
      startAt: string;
      team1Id: string;
      team2Id: string;
      team1Score?: number;
      team2Score?: number;
      completed?: boolean;
    }>;
  };
  onToggle: (key: string) => void; 
  onDoubleClick: (key: string) => void;
  onCancelMatch: (matchId: string) => void;
  onShowMatchConfirmation: (confirmation: { slot: string; opponent?: { id: string; name: string; color: string }; opponents?: Array<{ id: string; name: string; color: string }>; }) => void;
  actingAsTeam: string | null;
  actingAsPlayer: string | null;
  proxyAvail: Set<string>;
  proxyUnavail: Set<string>;
  selectedSlots: Set<string>;
  blockSelectCorners: string[];
  isBlockSelectMode: boolean;
  onBlockSelectClick: (key: string) => void;
  ladderInfo: {
    currentLadder?: { id: string; name: string; number: number; endDate: string };
    allLadders: Array<{ id: string; name: string; number: number; endDate: string }>;
  };
}) {
  const [clickTimeout, setClickTimeout] = useState<NodeJS.Timeout | null>(null);
  
  // Get other teams
  const otherTeams = teamsData.teams.filter(t => t.id !== teamsData.myTeamId);

  function TimeSlotVisual({ slotKey, rowLabel }: { slotKey: string; rowLabel: string }) {
    // Check if this is a past time
    const slotTime = new Date(slotKey);
    const now = new Date();
    const isPastTime = slotTime < now;
    
    // Check if slot is after ladder end date
    const ladderEndDate = ladderInfo?.currentLadder ? new Date(ladderInfo.currentLadder.endDate) : null;
    const isAfterLadderEnd = ladderEndDate && slotTime >= ladderEndDate;

    // Check if there's a confirmed match for this slot
    // Use flexible time matching to handle potential timezone/format differences
    const confirmedMatch = teamsData.matches?.find(match => {
      const matchTime = new Date(match.startAt).getTime();
      const slotTime = new Date(slotKey).getTime();
      return matchTime === slotTime;
    });
    
    // Debug logging for confirmed matches and time matching
    if (teamsData.matches && teamsData.matches.length > 0) {
      console.log('Slot key:', slotKey, 'timestamp:', new Date(slotKey).getTime());
      console.log('Available matches:', teamsData.matches.map(m => ({
        id: m.id,
        startAt: m.startAt,
        timestamp: new Date(m.startAt).getTime(),
        stringMatches: m.startAt === slotKey,
        timestampMatches: new Date(m.startAt).getTime() === new Date(slotKey).getTime()
      })));
    }
    
    if (confirmedMatch) {
      console.log('Found confirmed match for slot:', slotKey, confirmedMatch);
    }
    
    const iAvailable = myAvail.has(slotKey);
    const iUnavailable = myUnavail.has(slotKey);
    const partnerAvailable = partnerAvail.has(slotKey);
    const bothAvailable = iAvailable && partnerAvailable;

    const isSelected = selectedSlots.has(slotKey);
    const isCorner = blockSelectCorners.includes(slotKey);

    const handleClick = () => {
      if (isPastTime || isAfterLadderEnd) {
        return; // Don't allow clicks on past times or after ladder end
      }
      
      // Handle confirmed match clicks for cancellation
      if (confirmedMatch) {
        // Check if current user is part of either team
        const myTeamId = teamsData.myTeamId;
        const canCancel = myTeamId && (confirmedMatch.team1Id === myTeamId || confirmedMatch.team2Id === myTeamId);
        
        if (canCancel) {
          const isConfirm = confirm("Are you sure you want to cancel this match?");
          if (isConfirm) {
            onCancelMatch(confirmedMatch.id);
          }
        }
        return;
      }
      
      if (isBlockSelectMode) {
        onBlockSelectClick(slotKey);
        return;
      }
      
      // Normal click behavior - single/double click detection
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        setClickTimeout(null);
        onDoubleClick(slotKey);
      } else {
        const timeout = setTimeout(() => {
          setClickTimeout(null);
          onToggle(slotKey);
        }, 200);
        setClickTimeout(timeout);
      }
    };

    // If there's a confirmed match, show both teams' colors filling the entire slot
    if (confirmedMatch) {
      const team1 = teamsData.teams.find(t => t.id === confirmedMatch.team1Id);
      const team2 = teamsData.teams.find(t => t.id === confirmedMatch.team2Id);
      const myTeamId = teamsData.myTeamId;
      const canCancel = myTeamId && (confirmedMatch.team1Id === myTeamId || confirmedMatch.team2Id === myTeamId);
      
      return (
        <div 
          className={`relative h-12 border border-gray-300 ${canCancel ? 'cursor-pointer hover:opacity-80' : ''}`}
          onClick={handleClick}
        >
          {/* Left half - Team 1 */}
          <div 
            className="absolute left-0 top-0 bottom-0 right-1/2"
            style={{ backgroundColor: team1?.color || '#3B82F6' }}
          />
          {/* Right half - Team 2 */}
          <div 
            className="absolute right-0 top-0 bottom-0 left-1/2"
            style={{ backgroundColor: team2?.color || '#EF4444' }}
          />
          {/* Match label */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-white bg-black bg-opacity-60 px-1 rounded font-semibold">
              MATCH{canCancel ? ' (click to cancel)' : ''}
            </span>
          </div>
        </div>
      );
    }

    // For past times, grey everything out and show confirmed matches only
    if (isPastTime) {
      return (
        <div className="relative h-12 border border-gray-300 bg-gray-200 opacity-60">
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-gray-500 bg-white bg-opacity-60 px-1 rounded">
              {rowLabel}
            </span>
          </div>
        </div>
      );
    }

    // For slots after ladder end date, grey out and disable
    if (isAfterLadderEnd) {
      return (
        <div className="relative h-12 border border-gray-300 bg-red-100 opacity-60">
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-red-600 bg-white bg-opacity-60 px-1 rounded font-medium">
              Ended
            </span>
          </div>
        </div>
      );
    }

    // Check for potential matches (both teams available but not yet confirmed)
    const getPotentialMatches = () => {
      if (!bothAvailable) return [];

      // Find other teams that are available for this slot
      const availableTeams = teamsData.teams.filter(team => {
        if (team.id === teamsData.myTeamId) return false; // Skip my team
        
        const member1Available = team.member1.availability.includes(slotKey);
        const member2Available = team.member2?.availability.includes(slotKey) || false;
        const teamAvailable = member1Available && member2Available;
        
        if (!teamAvailable) return false;
        
        // Check if we already have a confirmed match with this team in this ladder
        const myTeamId = teamsData.myTeamId;
        if (myTeamId) {
          const [team1Id, team2Id] = [myTeamId, team.id].sort();
          const existingMatch = teamsData.matches?.find(match => 
            match.team1Id === team1Id && match.team2Id === team2Id && match.completed !== true
          );
          
          if (existingMatch) {
            console.log('Excluding team due to existing match:', {
              teamId: team.id,
              myTeamId: myTeamId,
              team1Id,
              team2Id,
              existingMatch
            });
            return false; // Already have a match with this team
          }
        }
        
        return true;
      });

      return availableTeams.map(team => ({
        id: team.id,
        name: `${team.member1.name || team.member1.email}${
          team.member2 && team.member2.id !== team.member1.id 
            ? ` & ${team.member2.name || team.member2.email}` 
            : ''
        }`,
        color: team.color
      }));
    };
    
    const potentialMatches = getPotentialMatches();
    const hasPotentialMatch = potentialMatches.length > 0;

    return (
      <div 
        className={`relative h-12 border border-gray-200 ${
          isPastTime || isAfterLadderEnd ? 'cursor-not-allowed bg-gray-100' : 
          isBlockSelectMode ? 'cursor-crosshair hover:border-blue-400' :
          'cursor-pointer hover:border-gray-400'
        } ${isSelected ? 'ring-2 ring-blue-500' : ''} ${isCorner ? 'ring-2 ring-green-500' : ''}`}
        onClick={handleClick}
      >
        {/* Left side - Other teams */}
        <div className="absolute left-0 top-0 bottom-0 right-1/2 flex">
          {otherTeams.map((team) => {
            const teamWidth = `${100 / Math.max(otherTeams.length, 1)}%`;
            
            // Show existing availability PLUS proxy overlays when acting on behalf
            let member1Available, member2Available, member1Unavailable = false, member2Unavailable = false;
            if (actingAsTeam === team.id) {
              if (actingAsPlayer === team.member1.id) {
                // Acting as member 1 only - show existing OR proxy state
                const member1ExistingAvail = team.member1.availability.includes(slotKey);
                const member1ProxyAvail = proxyAvail.has(slotKey);
                const member1ProxyUnavail = proxyUnavail.has(slotKey);
                
                member1Available = member1ExistingAvail || member1ProxyAvail;
                member1Unavailable = member1ProxyUnavail && !member1ExistingAvail; // Only show unavailable if not already available
                member2Available = team.member2?.availability.includes(slotKey) || false;
              } else if (actingAsPlayer === team.member2?.id) {
                // Acting as member 2 only - show existing OR proxy state
                member1Available = team.member1.availability.includes(slotKey);
                const member2ExistingAvail = team.member2?.availability.includes(slotKey) || false;
                const member2ProxyAvail = proxyAvail.has(slotKey);
                const member2ProxyUnavail = proxyUnavail.has(slotKey);
                
                member2Available = member2ExistingAvail || member2ProxyAvail;
                member2Unavailable = member2ProxyUnavail && !member2ExistingAvail; // Only show unavailable if not already available
              } else {
                // Acting for both members - show existing OR proxy state for each
                const member1ExistingAvail = team.member1.availability.includes(slotKey);
                const member2ExistingAvail = team.member2?.availability.includes(slotKey) || false;
                const proxyAvailForSlot = proxyAvail.has(slotKey);
                const proxyUnavailForSlot = proxyUnavail.has(slotKey);
                
                member1Available = member1ExistingAvail || proxyAvailForSlot;
                member1Unavailable = proxyUnavailForSlot && !member1ExistingAvail;
                member2Available = member2ExistingAvail || proxyAvailForSlot;
                member2Unavailable = proxyUnavailForSlot && !member2ExistingAvail;
              }
            } else {
              member1Available = team.member1.availability.includes(slotKey);
              member2Available = team.member2?.availability.includes(slotKey) || false;
            }
            
            const bothTeamAvailable = member1Available && member2Available;
            
            // Check if someone else set this availability (only for saved state) OR if we're currently editing
            const member1AvailIndex = team.member1.availability.indexOf(slotKey);
            const member2AvailIndex = team.member2?.availability.indexOf(slotKey) || -1;
            const member1SetByOther = member1AvailIndex >= 0 && team.member1.setByUserIds[member1AvailIndex] !== team.member1.id;
            const member2SetByOther = member2AvailIndex >= 0 && team.member2?.setByUserIds[member2AvailIndex] !== team.member2?.id;
            
            // Check if we're adding proxy changes
            const member1HasProxyChanges = actingAsTeam === team.id && (
              (actingAsPlayer === team.member1.id || actingAsPlayer === null) && 
              (proxyAvail.has(slotKey) || proxyUnavail.has(slotKey))
            );
            const member2HasProxyChanges = actingAsTeam === team.id && (
              (actingAsPlayer === team.member2?.id || actingAsPlayer === null) && 
              (proxyAvail.has(slotKey) || proxyUnavail.has(slotKey))
            );
            
            // Get my team's color for stripes
            const myTeamObj = teamsData.teams.find(t => t.id === teamsData.myTeamId);
            const myTeamColor = myTeamObj?.color || '#3B82F6';
            
            return (
              <div 
                key={team.id} 
                className={`relative flex flex-col ${actingAsTeam === team.id ? 'ring-2 ring-blue-400' : ''}`}
                style={{ width: teamWidth }}
              >
                {/* Top half - Member 1 */}
                <div 
                  className="flex-1 opacity-70 relative"
                  style={{ 
                    backgroundColor: member1Available ? team.color : member1Unavailable ? '#000000' : 'transparent'
                  }}
                >
                  {/* Add stripes if set by someone else or if we're making proxy changes */}
                  {member1Available && (member1SetByOther || member1HasProxyChanges) && (
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 1px, ${myTeamColor} 1px, ${myTeamColor} 2px)`
                      }}
                    />
                  )}
                  {/* Original pattern for half availability */}
                  {member1Available && !bothTeamAvailable && (
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.3) 2px, rgba(255,255,255,0.3) 4px)'
                      }}
                    />
                  )}
                </div>
                
                {/* Bottom half - Member 2 */}
                <div 
                  className="flex-1 opacity-70 relative"
                  style={{ 
                    backgroundColor: member2Available ? team.color : member2Unavailable ? '#000000' : 'transparent'
                  }}
                >
                  {/* Add stripes if set by someone else or if we're making proxy changes */}
                  {member2Available && (member2SetByOther || member2HasProxyChanges) && (
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 1px, ${myTeamColor} 1px, ${myTeamColor} 2px)`
                      }}
                    />
                  )}
                  {/* Original pattern for half availability */}
                  {member2Available && !bothTeamAvailable && (
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(255,255,255,0.3) 2px, rgba(255,255,255,0.3) 4px)'
                      }}
                    />
                  )}
                </div>
                
                {/* Solid overlay when both available */}
                {bothTeamAvailable && (
                  <div 
                    className="absolute inset-0 opacity-90 relative"
                    style={{ backgroundColor: team.color }}
                  >
                    {/* Add stripes overlay if set by someone else or currently editing */}
                    {(member1SetByOther || member2SetByOther || (member1HasProxyChanges || member2HasProxyChanges)) && (
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 1px, ${myTeamColor} 1px, ${myTeamColor} 2px)`
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right side - My team */}
        <div className="absolute right-0 top-0 bottom-0 left-1/2">
          <div className="h-full flex flex-col relative">
            {(() => {
              const myTeamObj = teamsData.teams.find(t => t.id === teamsData.myTeamId);
              const myTeamColor = myTeamObj?.color || '#3B82F6';
              
              // Check if my team's availability was set by proxy (others)
              let mySetByProxy = false;
              let partnerSetByProxy = false;
              
              if (myTeamObj) {
                const myAvailIndex = myTeamObj.member1.availability.indexOf(slotKey);
                const partnerAvailIndex = myTeamObj.member2?.availability.indexOf(slotKey) || -1;
                
                mySetByProxy = myAvailIndex >= 0 && myTeamObj.member1.setByUserIds[myAvailIndex] !== myTeamObj.member1.id;
                partnerSetByProxy = partnerAvailIndex >= 0 && myTeamObj.member2?.setByUserIds[partnerAvailIndex] !== myTeamObj.member2?.id;
              }
              
              return (
                <>
                  {/* Top half - Me */}
                  <div 
                    className="flex-1 relative"
                    style={{ 
                      backgroundColor: iAvailable ? myTeamColor : iUnavailable ? '#000000' : 'transparent', // Black for unavailable
                      backgroundImage: iAvailable && !bothAvailable ? 
                        'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.3) 2px, rgba(255,255,255,0.3) 4px)' : 'none'
                    }}
                  >
                    {/* Show proxy stripes if my availability was set by someone else */}
                    {iAvailable && mySetByProxy && (
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 1px, rgba(0,0,0,0.2) 1px, rgba(0,0,0,0.2) 2px)'
                        }}
                      />
                    )}
                  </div>
                  {/* Bottom half - Partner */}
                  <div 
                    className="flex-1 relative"
                    style={{ 
                      backgroundColor: partnerAvailable ? myTeamColor : 'transparent',
                      backgroundImage: partnerAvailable && !bothAvailable ? 
                        'repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(255,255,255,0.3) 2px, rgba(255,255,255,0.3) 4px)' : 'none'
                    }}
                  >
                    {/* Show proxy stripes if partner's availability was set by someone else */}
                    {partnerAvailable && partnerSetByProxy && (
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 1px, rgba(0,0,0,0.2) 1px, rgba(0,0,0,0.2) 2px)'
                        }}
                      />
                    )}
                  </div>
                  {/* Solid overlay when both available */}
                  {bothAvailable && (
                    <div 
                      className="absolute inset-0 opacity-90 relative" 
                      style={{ backgroundColor: myTeamColor }}
                    >
                      {/* Show proxy stripes on solid overlay if either was set by proxy */}
                      {(mySetByProxy || partnerSetByProxy) && (
                        <div
                          className="absolute inset-0"
                          style={{
                            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 1px, rgba(0,0,0,0.2) 1px, rgba(0,0,0,0.2) 2px)'
                          }}
                        />
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Time label overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-gray-700 bg-white bg-opacity-80 px-1 rounded">
            {rowLabel}
          </span>
        </div>

        {/* Confirm Match button overlay */}
        {hasPotentialMatch && !actingAsTeam && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (potentialMatches.length === 1) {
                  // Direct confirmation for single opponent
                  onShowMatchConfirmation({
                    slot: slotKey,
                    opponent: potentialMatches[0]
                  });
                } else {
                  // Multiple opponents - show selection
                  onShowMatchConfirmation({
                    slot: slotKey,
                    opponents: potentialMatches
                  });
                }
              }}
              className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 rounded font-semibold shadow-md transition-colors pointer-events-auto"
            >
              Confirm Match
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="overflow-auto rounded-2xl shadow">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white/80 backdrop-blur border p-2 text-left">Time</th>
            {days.map((d, i) => (
              <th key={i} className="border p-2 text-left min-w-[120px]">{DAY_LABELS[i]}<div className="text-xs text-muted-foreground">{d.toLocaleDateString()}</div></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: (22 - 6) * 2 }, (_, r) => {
            const hour = 6 + Math.floor(r / 2);
            const minute = r % 2 === 0 ? 0 : 30;
            const rowLabel = timeLabel(hour, minute);
            return (
              <tr key={r} className="odd:bg-muted/20">
                <td className="sticky left-0 bg-white/80 backdrop-blur border p-2 align-top text-sm font-medium">{rowLabel}</td>
                {days.map((d, c) => {
                  const key = isoAt(d, hour, minute);
                  return (
                    <td key={c} className="p-0 align-top w-32">
                      <TimeSlotVisual slotKey={key} rowLabel={rowLabel} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}