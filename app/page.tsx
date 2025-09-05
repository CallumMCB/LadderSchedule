"use client";
import React, { useMemo, useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, LinkIcon, CheckCircle2, XCircle } from "lucide-react";
import { WeatherCell } from "@/components/WeatherCell";

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

function formatDate(d: Date | undefined) {
  if (!d) return 'Loading...';
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
  
  // Store all matches and availabilities
  const [allMatches, setAllMatches] = useState<Array<{
    id: string;
    startAt: string;
    team1Id: string;
    team2Id: string;
    team1Score?: number;
    team2Score?: number;
    completed?: boolean;
  }>>([]);
  
  const [allAvailabilities, setAllAvailabilities] = useState<Map<string, {
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
  }>>(new Map());
  
  const [ladderInfo, setLadderInfo] = useState<{
    currentLadder?: { id: string; name: string; number: number; endDate: string };
    allLadders: Array<{ id: string; name: string; number: number; endDate: string }>;
  }>({ allLadders: [] });
  const [ladderInfoLoaded, setLadderInfoLoaded] = useState(false);

  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [isMobile, setIsMobile] = useState(false);
  const [visibleDays, setVisibleDays] = useState(7);
  const [dayOffset, setDayOffset] = useState(0);
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [myAvail, setMyAvail] = useState<Set<string>>(new Set());
  const [myUnavail, setMyUnavail] = useState<Set<string>>(new Set());
  const [partnerAvail, setPartnerAvail] = useState<Set<string>>(new Set());
  const [partnerAvailSetByMe, setPartnerAvailSetByMe] = useState<Set<string>>(new Set());
  const [myProxySlots, setMyProxySlots] = useState<Set<string>>(new Set()); // My slots set by others
  const [partnerAvailSetByProxy, setPartnerAvailSetByProxy] = useState<Set<string>>(new Set()); // Partner slots set by others
  const [slotSetByUserIds, setSlotSetByUserIds] = useState<Map<string, string>>(new Map()); // Map slot to userId who set it  
  const [proxyTakeoverSlots, setProxyTakeoverSlots] = useState<Set<string>>(new Set()); // Slots taken over from proxy
  const [proxyAvail, setProxyAvail] = useState<Set<string>>(new Set()); // For when acting on behalf
  const [proxyUnavail, setProxyUnavail] = useState<Set<string>>(new Set()); // Proxy unavailable state
  const [proxyModifiedSlots, setProxyModifiedSlots] = useState<Set<string>>(new Set()); // Track all modified slots
  const [teamProxyStates, setTeamProxyStates] = useState<Record<string, { avail: Set<string>; unavail: Set<string> }>>({});
  const [showMatchConfirmation, setShowMatchConfirmation] = useState<{
    slot: string;
    opponent?: { id: string; name: string; color: string };
    opponents?: Array<{ id: string; name: string; color: string }>;
  } | null>(null);
  const [showRescheduleConfirmation, setShowRescheduleConfirmation] = useState<{
    existingMatch: { id: string; startAt: string; team1Id: string; team2Id: string };
    newTime: string;
    opponentName: string;
  } | null>(null);
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState<{
    matchId: string;
    matchInfo: string;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [actingAsTeam, setActingAsTeam] = useState<string | null>(null);
  const [actingAsPlayer, setActingAsPlayer] = useState<string | null>(null);
  
  // Selection state
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [showBulkActionModal, setShowBulkActionModal] = useState(false);
  const [isBlockSelectMode, setIsBlockSelectMode] = useState(false);
  const [blockSelectCorners, setBlockSelectCorners] = useState<string[]>([]);
  
  // Time range display state
  const [showEarlyTimes, setShowEarlyTimes] = useState(false); // Show 6am-9:30am
  const [showLateTimes, setShowLateTimes] = useState(false); // Show 9pm-10pm
  const [isFullScreen, setIsFullScreen] = useState(false); // Full screen mode for mobile
  
  // Weather display state
  const [showWeather, setShowWeather] = useState(true); // Show weather by default
  const [weatherCanLoad, setWeatherCanLoad] = useState(false); // Control when weather can load
  
  // Note: Weather display now handled by individual WeatherCell components
  const [showHiddenTeams, setShowHiddenTeams] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [recentActivities, setRecentActivities] = useState<Array<{
    type: string;
    timestamp: string;
    user?: string;
    team1?: string;
    team2?: string;
    action?: string;
    slot?: string;
    confirmed?: boolean;
    completed?: boolean;
    score?: string;
    setBy?: string;
    isProxy?: boolean;
  }>>([]); // Show teams with confirmed matches
  
  // Undo state
  const [undoStack, setUndoStack] = useState<Array<{
    myAvail: Set<string>;
    myUnavail: Set<string>;
    partnerAvail: Set<string>;
    partnerAvailSetByMe: Set<string>;
    myProxySlots?: Set<string>;
    partnerAvailSetByProxy?: Set<string>;
    slotSetByUserIds?: Map<string, string>;
    proxyTakeoverSlots?: Set<string>;
  }>>([]);

  const teamAvail = useMemo(() => {
    const s = new Set<string>();
    myAvail.forEach(k => { if (partnerAvail.has(k)) s.add(k); });
    return s;
  }, [myAvail, partnerAvail]);


  const { days } = useMemo(() => buildSlotsForWeek(weekStart), [weekStart]);

  // Mobile detection and setup
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setVisibleDays(window.innerWidth < 480 ? 2 : 4);
        
        // Start mobile calendar from today instead of Monday
        const today = new Date();
        const mondayOfWeek = startOfWeekMonday(today);
        const todayDayIndex = Math.floor((today.getTime() - mondayOfWeek.getTime()) / (1000 * 60 * 60 * 24));
        setDayOffset(Math.max(0, todayDayIndex));
      } else {
        setVisibleDays(7);
        setDayOffset(0);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);


  // Mobile navigation functions
  function navigateDays(direction: 'prev' | 'next') {
    if (direction === 'prev') {
      if (dayOffset > 0) {
        setDayOffset(prev => Math.max(0, prev - visibleDays));
      } else {
        // Go to previous week
        setWeekStart(prev => {
          const newDate = new Date(prev);
          newDate.setDate(newDate.getDate() - 7);
          return newDate;
        });
        setDayOffset(7 - visibleDays);
      }
    } else {
      if (dayOffset + visibleDays < 7) {
        setDayOffset(prev => Math.min(7 - visibleDays, prev + visibleDays));
      } else {
        // Go to next week
        setWeekStart(prev => {
          const newDate = new Date(prev);
          newDate.setDate(newDate.getDate() + 7);
          return newDate;
        });
        setDayOffset(0);
      }
    }
  }

  function getVisibleDays() {
    if (isMobile) {
      return days.slice(dayOffset, dayOffset + visibleDays);
    }
    return days;
  }

  // Load availability data when component mounts or week changes
  useEffect(() => {
    if (session) {
      loadLadderInfo();
    }
  }, [session]);

  useEffect(() => {
    if (session && ladderInfo?.currentLadder) {
      loadAllData();
    }
  }, [session, ladderInfo?.currentLadder?.id]);
  
  // Function to load availability for a specific week
  const loadWeekAvailability = React.useCallback(async (weekStartISO: string) => {
    try {
      const ladderId = ladderInfo?.currentLadder?.id;
      const url = `/api/teams/availability?weekStart=${weekStartISO}${ladderId ? `&ladderId=${ladderId}` : ''}`;
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        
        // Update the availability map
        setAllAvailabilities(prev => {
          const newMap = new Map(prev);
          newMap.set(weekStartISO, {
            teams: data.teams,
            myTeamId: data.myTeamId,
            currentUserId: data.currentUserId
          });
          return newMap;
        });
        
        // Filter matches for current week  
        const weekStartUTC = new Date(weekStartISO);
        const weekEndTime = new Date(weekStartUTC.getTime() + 7 * 24 * 60 * 60 * 1000);
        const currentWeekMatches = allMatches.filter(match => {
          const matchTime = new Date(match.startAt);
          return matchTime >= weekStartUTC && matchTime < weekEndTime;
        });
        
        setTeamsData({
          teams: data.teams,
          myTeamId: data.myTeamId,
          currentUserId: data.currentUserId,
          matches: allMatches // Use all matches, not just current week
        });
      }
    } catch (error) {
      console.error(`Failed to load availability for week ${weekStartISO}:`, error);
    }
  }, [ladderInfo, allMatches]);
  
  // Function to update current week data
  const updateCurrentWeekData = React.useCallback(() => {
    const weekStartUTC = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
    const weekStartISO = weekStartUTC.toISOString();
    
    // Get availability data for current week
    const weekData = allAvailabilities.get(weekStartISO);
    
    // Filter matches for current week
    const weekEndTime = new Date(weekStartUTC.getTime() + 7 * 24 * 60 * 60 * 1000);
    const currentWeekMatches = allMatches.filter(match => {
      const matchTime = new Date(match.startAt);
      return matchTime >= weekStartUTC && matchTime < weekEndTime;
    });
    
    console.log('Updating current week data for:', weekStartISO);
    console.log('Week matches:', currentWeekMatches.length);
    console.log('Week availability loaded:', !!weekData);
    
    if (weekData) {
      setTeamsData({
        teams: weekData.teams,
        myTeamId: weekData.myTeamId,
        currentUserId: weekData.currentUserId,
        matches: allMatches // Use all matches, not just current week
      });
    } else {
      // If we don't have availability data for this week, load it
      loadWeekAvailability(weekStartISO).catch(console.error);
    }
  }, [weekStart, allAvailabilities, allMatches, ladderInfo, loadWeekAvailability]);

  // When week changes, update teamsData with the current week's data
  useEffect(() => {
    if (allAvailabilities.size > 0 || allMatches.length > 0) {
      updateCurrentWeekData();
    }
  }, [updateCurrentWeekData, allAvailabilities, allMatches]);

  // Sync my availability from teams data and load unavailable slots
  useEffect(() => {
    if (teamsData.teams.length > 0 && teamsData.myTeamId && teamsData.currentUserId) {
      const myTeamObj = teamsData.teams.find(t => t.id === teamsData.myTeamId);
      if (myTeamObj) {
        // Determine which member I am
        const isMember1 = myTeamObj.member1.id === teamsData.currentUserId;
        const isMember2 = myTeamObj.member2?.id === teamsData.currentUserId;
        
        if (isMember1 || isMember2) {
          const myMemberData = isMember1 ? myTeamObj.member1 : myTeamObj.member2!;
          
          // Get all availability for this member
          const myAllAvailability = myMemberData.availability || [];
          const mySetByUserIds = myMemberData.setByUserIds || [];
          
          // Teams data contains "available" slots - update my available state
          setMyAvail(new Set(myAllAvailability));
          
          // For partner availability
          const partnerMemberData = isMember1 ? myTeamObj.member2 : myTeamObj.member1;
          if (partnerMemberData && partnerMemberData.id !== teamsData.currentUserId) {
            setPartnerAvail(new Set(partnerMemberData.availability || []));
          } else if (partnerMemberData?.id === teamsData.currentUserId) {
            // Solo player - partner is same as me
            setPartnerAvail(new Set(myAllAvailability));
          }
          
          // Track proxy slots
          const proxySlots = new Set<string>();
          myAllAvailability.forEach((slot: string, index: number) => {
            const setByUserId = mySetByUserIds[index];
            if (setByUserId && setByUserId !== teamsData.currentUserId) {
              proxySlots.add(slot);
            }
          });
          setMyProxySlots(proxySlots);
          
          // Also load my unavailable slots from personal API since teams data doesn't include them
          loadPersonalUnavailability();
        }
      }
    }
  }, [teamsData, teamsData.teams, teamsData.myTeamId, teamsData.currentUserId]);
  
  // Note: Weather data is now loaded by individual WeatherCell components
  
  // Load unavailable slots from personal API
  const loadPersonalUnavailability = async () => {
    try {
      const myResponse = await fetch(`/api/availability?weekStart=${weekStart.toISOString()}`);
      if (myResponse.ok) {
        const data = await myResponse.json();
        setMyUnavail(new Set(data.myUnavailableSlots || []));
      }
    } catch (error) {
      console.error("Failed to load personal unavailability:", error);
    }
  };

  // Load recent activities
  const loadRecentActivities = async () => {
    try {
      const ladderId = ladderInfo?.currentLadder?.id;
      const response = await fetch(`/api/activity${ladderId ? `?ladderId=${ladderId}` : ''}`);
      if (response.ok) {
        const data = await response.json();
        setRecentActivities(data.activities || []);
      }
    } catch (error) {
      console.error("Failed to load activities:", error);
    }
  };

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
        partnerAvailSetByMe: new Set(partnerAvailSetByMe),
        myProxySlots: new Set(myProxySlots),
        partnerAvailSetByProxy: new Set(partnerAvailSetByProxy),
        slotSetByUserIds: new Map(slotSetByUserIds),
        proxyTakeoverSlots: new Set(proxyTakeoverSlots)
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
    setMyProxySlots(new Set(lastState.myProxySlots || []));
    setPartnerAvailSetByProxy(new Set(lastState.partnerAvailSetByProxy || []));
    setSlotSetByUserIds(new Map(lastState.slotSetByUserIds || []));
    setProxyTakeoverSlots(new Set(lastState.proxyTakeoverSlots || []));
    
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
    
    // Clear proxy takeover tracking
    setProxyTakeoverSlots(new Set());
    
    // Note: Don't clear myProxySlots and partnerAvailSetByProxy as these track existing proxy data
    
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
          setProxyModifiedSlots(prev => new Set(prev).add(slot));
        } else if (action === 'unavailable') {
          setProxyAvail(prev => {
            const next = new Set(prev);
            next.delete(slot);
            return next;
          });
          setProxyUnavail(prev => new Set(prev).add(slot));
          setProxyModifiedSlots(prev => new Set(prev).add(slot));
        } else if (action === 'both-available') {
          setProxyAvail(prev => new Set(prev).add(slot));
          setProxyUnavail(prev => {
            const next = new Set(prev);
            next.delete(slot);
            return next;
          });
          setProxyModifiedSlots(prev => new Set(prev).add(slot));
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
          setProxyModifiedSlots(prev => new Set(prev).add(slot));
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
      // First, determine the current actual state of the target team member
      const team = teamsData.teams.find(t => t.id === actingAsTeam);
      let currentActualAvailable = false;
      
      if (team) {
        if (actingAsPlayer === team.member1.id) {
          currentActualAvailable = team.member1.availability.includes(key);
        } else if (actingAsPlayer === team.member2?.id) {
          currentActualAvailable = team.member2?.availability.includes(key) || false;
        } else if (!actingAsPlayer) {
          // Acting for both members
          const member1Available = team.member1.availability.includes(key);
          const member2Available = team.member2?.availability.includes(key) || false;
          
          // For solo players (both members are same person), just use member1's availability
          if (team.lookingForPartner || (team.member2 && team.member2.id === team.member1.id)) {
            currentActualAvailable = member1Available;
          } else {
            // For real teams, consider available if both are available
            currentActualAvailable = member1Available && member2Available;
          }
        }
      }
      
      // Check proxy state modifications
      const hasProxyAvailable = proxyAvail.has(key);
      const hasProxyUnavailable = proxyUnavail.has(key);
      
      // Determine effective current state (actual + proxy modifications)
      let effectiveAvailable = currentActualAvailable;
      if (hasProxyAvailable) effectiveAvailable = true;
      if (hasProxyUnavailable) effectiveAvailable = false;
      
      console.log('Acting on behalf - slot:', key, 'states:', { 
        currentActualAvailable, 
        hasProxyAvailable, 
        hasProxyUnavailable, 
        effectiveAvailable 
      });
      
      // Three-state cycle: available → unavailable → unset → available
      if (hasProxyUnavailable) {
        // Currently Unavailable (via proxy) → change to Unset (remove all proxy modifications)
        console.log('Unavailable → Unset');
        setProxyUnavail(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setProxyAvail(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        // Keep tracking this slot as modified even when cleared
        setProxyModifiedSlots(prev => new Set(prev).add(key));
      } else if (effectiveAvailable) {
        // Currently Available (either from DB or proxy) → change to Unavailable
        console.log('Available → Unavailable');
        setProxyAvail(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setProxyUnavail(prev => new Set(prev).add(key));
        setProxyModifiedSlots(prev => new Set(prev).add(key));
      } else {
        // Unset/None state (no availability, no proxy modifications) → change to Available
        console.log('Unset → Available');
        setProxyAvail(prev => new Set(prev).add(key));
        setProxyUnavail(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setProxyModifiedSlots(prev => new Set(prev).add(key));
      }
    } else {
      // Normal behavior for my own team
      const isAvailable = myAvail.has(key);
      const isUnavailable = myUnavail.has(key);
      
      // Check if this slot was set by proxy for my team
      const myTeamObj = teamsData.teams.find(t => t.id === teamsData.myTeamId);
      let mySlotSetByProxy = false;
      let partnerSlotSetByProxy = false;
      
      if (myTeamObj && teamsData.currentUserId) {
        const myAvailIndex = myTeamObj.member1.availability.indexOf(key);
        const partnerAvailIndex = myTeamObj.member2?.availability.indexOf(key) || -1;
        
        mySlotSetByProxy = myAvailIndex >= 0 && myTeamObj.member1.setByUserIds[myAvailIndex] !== myTeamObj.member1.id;
        partnerSlotSetByProxy = partnerAvailIndex >= 0 && myTeamObj.member2?.setByUserIds[partnerAvailIndex] !== myTeamObj.member2?.id;
      }
      
      // Determine if this click should trigger proxy takeover logic
      const isProxyTakeover = mySlotSetByProxy || partnerSlotSetByProxy;
      
      // Three-state cycle: available → not_available → none → available
      if (!isAvailable && !isUnavailable) {
        // None → Available
        setMyAvail(prev => {
          const newSet = new Set(prev).add(key);
          // Check for matches if both team members are available
          if (partnerAvail.has(key)) {
            setTimeout(() => checkForMatches(key, true, true), 100);
          }
          return newSet;
        });
        // Mark as takeover if this was set by proxy
        if (isProxyTakeover) {
          setProxyTakeoverSlots(prev => new Set(prev).add(key));
        }
      } else if (isAvailable && !isUnavailable) {
        // Available → Not Available
        setMyAvail(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setMyUnavail(prev => new Set(prev).add(key));
        // Mark as takeover if this was set by proxy
        if (isProxyTakeover) {
          setProxyTakeoverSlots(prev => new Set(prev).add(key));
        }
      } else {
        // Not Available → None (clear both states)
        setMyUnavail(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        // If this was a proxy takeover going to none, remove from tracking
        if (isProxyTakeover) {
          setProxyTakeoverSlots(prev => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
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
        setProxyModifiedSlots(prev => new Set(prev).add(key));
      } else {
        // Set both as available and clear unavailable
        setProxyAvail(prev => new Set(prev).add(key));
        setProxyUnavail(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setProxyModifiedSlots(prev => new Set(prev).add(key));
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
      // Collect all teams with changes to save
      const teamsToSave = new Map<string, { avail: Set<string>; unavail: Set<string> }>();
      
      // Add currently active team changes
      if (actingAsTeam && proxyModifiedSlots.size > 0) {
        teamsToSave.set(actingAsTeam, {
          avail: new Set(proxyAvail),
          unavail: new Set(proxyUnavail)
        });
      }
      
      // Add any saved team proxy states that haven't been committed
      Object.entries(teamProxyStates).forEach(([teamId, states]) => {
        if (states.avail.size > 0 || states.unavail.size > 0) {
          teamsToSave.set(teamId, {
            avail: new Set(states.avail),
            unavail: new Set(states.unavail)
          });
        }
      });
      
      if (teamsToSave.size === 0 && (myAvail.size > 0 || myUnavail.size > 0 || partnerAvail.size > 0)) {
        // Save own availability if no proxy changes
        await saveOwnAvailability();
        return;
      }
      
      // Save changes for all edited teams
      const savePromises: Promise<Response>[] = [];
      const teamNames: string[] = [];
      
      Array.from(teamsToSave.keys()).forEach(teamId => {
        const changes = teamsToSave.get(teamId)!;
        const team = teamsData.teams.find(t => t.id === teamId);
        if (!team) return;
        
        teamNames.push(team.member1.name || team.member1.email);
        
        // Determine which members to save based on actingAsPlayer
        const shouldSaveMember1 = !actingAsPlayer || actingAsPlayer === team.member1.id;
        const shouldSaveMember2 = (!actingAsPlayer || actingAsPlayer === team.member2?.id) && 
                                  team.member2 && team.member2.id !== team.member1.id;
        
        // Save for member1 if needed
        if (shouldSaveMember1) {
          savePromises.push(
            fetch('/api/availability/proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                weekStartISO: weekStart.toISOString(),
                availableSlots: Array.from(changes.avail),
                unavailableSlots: Array.from(changes.unavail),
                targetUserId: team.member1.id,
              }),
            })
          );
        }
        
        // Save for member2 if needed and different person
        if (shouldSaveMember2 && team.member2) {
          savePromises.push(
            fetch('/api/availability/proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                weekStartISO: weekStart.toISOString(),
                availableSlots: Array.from(changes.avail),
                unavailableSlots: Array.from(changes.unavail),
                targetUserId: team.member2.id,
              }),
            })
          );
        }
      });
      
      const responses = await Promise.all(savePromises);
      const allSuccess = responses.every(r => r.ok);
      
      if (allSuccess) {
        setSaveMsg(`Saved changes for ${teamNames.length} team${teamNames.length !== 1 ? 's' : ''}!`);
        // Clear all proxy states
        setTeamProxyStates({});
        setProxyAvail(new Set());
        setProxyUnavail(new Set());
        setProxyModifiedSlots(new Set());
        await loadAllData();
        setTimeout(() => setSaveMsg(""), 2000);
      } else {
        setSaveMsg("Some saves failed");
        setTimeout(() => setSaveMsg(""), 3000);
      }
      
      // If no teams to save via proxy, save own availability
      if (teamsToSave.size === 0) {
        await saveOwnAvailability();
      }
      
    } catch (error) {
      setSaveMsg("Network error");
      setTimeout(() => setSaveMsg(""), 3000);
    } finally {
      setSaving(false);
    }
  }
  
  async function saveOwnAvailability() {
    // Save own availability
    const normalAvailSlots = Array.from(myAvail).filter(slot => !proxyTakeoverSlots.has(slot));
    const takeoverSlots = Array.from(proxyTakeoverSlots);
    
    const promises = [
      fetch('/api/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStartISO: weekStart.toISOString(),
          slots: normalAvailSlots,
        }),
      })
    ];

    // Save partner availability that I set via double-click
    const myTeamObj = teamsData.teams?.find(team => team.id === teamsData.myTeamId);
    if (myTeamObj && myTeamObj.member2 && myTeamObj.member2.id !== myTeamObj.member1.id && partnerAvailSetByMe.size > 0) {
      // Only save partner availability if partner is a different person and I set some slots for them
      promises.push(
        fetch('/api/availability/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weekStartISO: weekStart.toISOString(),
            availableSlots: Array.from(partnerAvailSetByMe),
            unavailableSlots: [], // We only set partner as available via double-click, never unavailable
            targetUserId: myTeamObj.member2.id,
          }),
        })
      );
    }

    if (takeoverSlots.length > 0) {
      const myUserId = teamsData.currentUserId;
      if (myUserId) {
        promises.push(
          fetch('/api/availability/takeover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              weekStartISO: weekStart.toISOString(),
              availableSlots: Array.from(myAvail).filter(slot => proxyTakeoverSlots.has(slot)),
              unavailableSlots: Array.from(myUnavail).filter(slot => proxyTakeoverSlots.has(slot)),
              noneSlots: takeoverSlots.filter(slot => !myAvail.has(slot) && !myUnavail.has(slot)),
              targetUserId: myUserId,
            }),
          })
        );
      }
    }

    const responses = await Promise.all(promises);
    const allSuccess = responses.every(r => r.ok);

    if (allSuccess) {
      setSaveMsg("Saved successfully!");
      setProxyTakeoverSlots(new Set());
      setPartnerAvailSetByMe(new Set()); // Clear partner availability that I set after successful save
      await loadAllMembersAvailability();
      setTimeout(() => setSaveMsg(""), 2000);
    } else {
      setSaveMsg("Some saves failed");
      setTimeout(() => setSaveMsg(""), 3000);
    }
  }

  async function loadAllData() {
    try {
      const ladderId = ladderInfo?.currentLadder?.id;
      
      // Reset weather loading flag at the start
      setWeatherCanLoad(false);
      
      // Load all matches for the current ladder
      const matchesResponse = await fetch(`/api/matches/all${ladderId ? `?ladderId=${ladderId}` : ''}`);
      if (matchesResponse.ok) {
        const matchesData = await matchesResponse.json();
        console.log('Loaded all matches:', matchesData.matches.length);
        setAllMatches(matchesData.matches);
      }
      
      // Load availability data for multiple weeks (current week and surrounding weeks)
      const weeks: Date[] = [];
      const currentWeek = startOfWeekMonday(new Date());
      
      // Load 8 weeks total (4 weeks back, current week, 3 weeks forward)
      for (let i = -4; i <= 3; i++) {
        const weekDate = new Date(currentWeek);
        weekDate.setDate(weekDate.getDate() + (i * 7));
        weeks.push(weekDate);
      }
      
      const availabilityPromises = weeks.map(async (week) => {
        const weekStartUTC = new Date(week.getFullYear(), week.getMonth(), week.getDate());
        const weekStartISO = weekStartUTC.toISOString();
        const url = `/api/teams/availability?weekStart=${weekStartISO}${ladderId ? `&ladderId=${ladderId}` : ''}`;
        
        try {
          const response = await fetch(url);
          if (response.ok) {
            const data = await response.json();
            return { week: weekStartISO, data };
          }
        } catch (error) {
          console.error(`Failed to load availability for week ${weekStartISO}:`, error);
        }
        return null;
      });
      
      const availabilityResults = await Promise.all(availabilityPromises);
      const availabilityMap = new Map();
      
      availabilityResults.forEach(result => {
        if (result) {
          availabilityMap.set(result.week, {
            teams: result.data.teams,
            myTeamId: result.data.myTeamId,
            currentUserId: result.data.currentUserId
          });
        }
      });
      
      console.log('Loaded availability for', availabilityMap.size, 'weeks');
      setAllAvailabilities(availabilityMap);
      
      // Now that availability is loaded, allow weather to load
      setWeatherCanLoad(true);
      
      // Load recent activities
      await loadRecentActivities();
      
    } catch (error) {
      console.error("Failed to load all data:", error);
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
        setMyUnavail(new Set(data.myUnavailableSlots || []));
        setPartnerAvail(new Set(data.partnerSlots || []));
        
        // Track which slots were set by proxy using the full data
        const myProxySlots = new Set<string>();
        const partnerProxySlots = new Set<string>();
        
        // Process all my slots (both available and unavailable) to detect proxy
        const allMySlots = [...(data.mySlots || []), ...(data.myUnavailableSlots || [])];
        const allMyStates = [...(data.myAvailabilityStates || [])];
        const allMySetBy = [...(data.mySlotsSetBy || [])];
        
        const userIdMap = new Map<string, string>();
        
        allMySlots.forEach((slot: string, index: number) => {
          const setByUserId = allMySetBy[index];
          // If setByUserId is not null, it was set by proxy
          if (setByUserId) {
            myProxySlots.add(slot);
            userIdMap.set(slot, setByUserId);
          }
        });
        
        // Process partner slots  
        const allPartnerSlots = [...(data.partnerSlots || []), ...(data.partnerUnavailableSlots || [])];
        const allPartnerSetBy = [...(data.partnerSlotsSetBy || [])];
        
        allPartnerSlots.forEach((slot: string, index: number) => {
          const setByUserId = allPartnerSetBy[index];
          // If setByUserId is not null, it was set by proxy
          if (setByUserId) {
            partnerProxySlots.add(slot);
            userIdMap.set(slot, setByUserId);
          }
        });
        
        setSlotSetByUserIds(userIdMap);
        
        setMyProxySlots(myProxySlots);
        setPartnerAvailSetByProxy(partnerProxySlots);
        
        if (data.partnerEmail) {
          setPartnerEmail(data.partnerEmail);
        }
      }

      // Reload all data to get updated matches and availability
      await loadAllData();
      await loadRecentActivities();
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


  // Full screen calendar component
  if (isFullScreen) {
    return (
      <div className="fixed inset-0 bg-white z-40 overflow-hidden flex flex-col">
        {/* Full screen header */}
        <div className="sticky top-0 bg-white border-b z-50 p-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Calendar</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFullScreen(false)}
              className="text-xs"
            >
              ✕ Close
            </Button>
          </div>
        </div>
        
        {/* Full screen calendar grid */}
        <div className="flex-1 overflow-auto">
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
            onShowCancelConfirmation={setShowCancelConfirmation}
            actingAsTeam={actingAsTeam}
            actingAsPlayer={actingAsPlayer}
            proxyAvail={proxyAvail}
            proxyUnavail={proxyUnavail}
            selectedSlots={selectedSlots}
            blockSelectCorners={blockSelectCorners}
            isBlockSelectMode={isBlockSelectMode}
            onBlockSelectClick={handleBlockSelectClick}
            ladderInfo={ladderInfo}
            showEarlyTimes={showEarlyTimes}
            showLateTimes={showLateTimes}
            showHiddenTeams={showHiddenTeams}
            showWeather={showWeather}
            weatherCanLoad={weatherCanLoad}
            isFullScreen={true}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full sm:max-w-6xl sm:mx-auto p-0 sm:p-4 space-y-0 sm:space-y-6">
      {/* Ladder Info Header */}
      {ladderInfo?.currentLadder && (
        <div className="bg-blue-50 border-0 sm:border sm:border-blue-200 rounded-none sm:rounded-lg p-3">
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

      {/* Help Button */}
      <div className="flex justify-center sm:justify-start">
        <a href="/help" className="text-blue-600 hover:underline text-sm">
          Need help? View the visual guide →
        </a>
      </div>

      {/* Teams Display */}
      {teamsData.teams.length > 0 && (
        <div className="border-0 sm:border sm:border-gray-200 rounded-none sm:rounded-lg p-4 sm:bg-white bg-transparent sm:shadow-sm">
          <div className="">
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
          </div>
        </div>
      )}

      {/* Team/Player Selection for Acting On Behalf */}
      <div className="border-0 sm:border sm:border-gray-200 rounded-none sm:rounded-lg p-3 sm:bg-white bg-transparent sm:shadow-sm">
        <div className="">
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
                  setProxyModifiedSlots(new Set());
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
        </div>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center gap-2 px-3 sm:px-0">
        {isMobile ? (
          <>
            {/* Mobile Day Navigation */}
            <Button variant="outline" onClick={() => navigateDays('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              onClick={() => setShowDateRangePicker(!showDateRangePicker)}
              className="text-sm font-medium whitespace-nowrap hover:text-blue-600 flex items-center gap-1"
            >
              {formatDate(getVisibleDays()[0])}
              {visibleDays > 1 && ` - ${formatDate(getVisibleDays()[visibleDays - 1])}`}
              <span className="text-xs">📅</span>
            </button>
            <Button variant="outline" onClick={() => navigateDays('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            {/* Desktop Week Navigation */}
            <Button variant="outline" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium whitespace-nowrap">{weekLabel}</div>
            <Button variant="outline" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>


      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 px-3 sm:px-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
          {isBlockSelectMode && (
            <div className="flex items-center gap-2 px-2 py-1 bg-blue-100 rounded">
              <span className="text-blue-800 font-medium">Block Select Mode</span>
              <span className="text-xs text-blue-600 hidden sm:inline">
                {blockSelectCorners.length === 0 ? "Click first corner or drag to select" :
                 blockSelectCorners.length === 1 ? "Click second corner to complete rectangle" : ""}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-row items-center gap-3 text-sm flex-shrink-0">
          <span className="text-gray-600 whitespace-nowrap">Show times:</span>
          <div className="flex gap-2 flex-shrink-0">
            <Button
              variant={showEarlyTimes ? "default" : "outline"}
              size="sm"
              onClick={() => setShowEarlyTimes(!showEarlyTimes)}
              className="text-xs whitespace-nowrap"
            >
              {showEarlyTimes ? "Hide" : "Show"} early
            </Button>
            <Button
              variant={showLateTimes ? "default" : "outline"}
              size="sm"
              onClick={() => setShowLateTimes(!showLateTimes)}
              className="text-xs whitespace-nowrap"
            >
              {showLateTimes ? "Hide" : "Show"} late
            </Button>
            <Button
              variant={isFullScreen ? "default" : "outline"}
              size="sm"
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="text-xs whitespace-nowrap sm:hidden"
            >
              {isFullScreen ? "Exit" : "Full Screen"}
            </Button>
          </div>
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
        onShowCancelConfirmation={setShowCancelConfirmation}
        actingAsTeam={actingAsTeam}
        actingAsPlayer={actingAsPlayer}
        proxyAvail={proxyAvail}
        proxyUnavail={proxyUnavail}
        selectedSlots={selectedSlots}
        blockSelectCorners={blockSelectCorners}
        isBlockSelectMode={isBlockSelectMode}
        onBlockSelectClick={handleBlockSelectClick}
        ladderInfo={ladderInfo}
        showEarlyTimes={showEarlyTimes}
        showLateTimes={showLateTimes}
        showHiddenTeams={showHiddenTeams}
        showWeather={showWeather}
        weatherCanLoad={weatherCanLoad}
      />

      <details className="px-3 sm:px-0">
        <summary className="cursor-pointer text-sm text-muted-foreground">Recent Activity</summary>
        <div className="text-xs bg-muted/50 p-3 rounded-none sm:rounded-xl space-y-1 max-h-64 overflow-y-auto">
          <div className="font-medium mb-2">Recent Calendar Changes:</div>
          {recentActivities.length === 0 ? (
            <div className="text-muted-foreground italic">No recent activity</div>
          ) : (
            <div className="space-y-1">
              {recentActivities.map((activity, index) => (
                <div key={index} className="flex justify-between items-start">
                  <div className="flex-1">
                    {activity.type === 'match' ? (
                      <span>
                        <span className="font-medium">{activity.team1}</span> vs{" "}
                        <span className="font-medium">{activity.team2}</span>
                        {activity.completed ? (
                          <span className="text-green-600"> - Final: {activity.score}</span>
                        ) : activity.confirmed ? (
                          <span className="text-blue-600"> - Confirmed</span>
                        ) : (
                          <span className="text-yellow-600"> - Pending</span>
                        )}
                        <div className="text-muted-foreground">
                          {new Date(activity.slot!).toLocaleDateString()} at{" "}
                          {new Date(activity.slot!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </span>
                    ) : (
                      <span>
                        {activity.setBy && activity.setBy !== activity.user ? (
                          <span><span className="font-medium">{activity.setBy}</span> set{" "}
                          <span className="font-medium">{activity.user}</span> as {activity.action}</span>
                        ) : (
                          <span><span className="font-medium">{activity.user}</span> marked as {activity.action}</span>
                        )}
                        <div className="text-muted-foreground">
                          {new Date(activity.slot!).toLocaleDateString()} at{" "}
                          {new Date(activity.slot!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground ml-2">
                    {new Date(activity.timestamp).toLocaleDateString() === new Date().toLocaleDateString() 
                      ? new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : new Date(activity.timestamp).toLocaleDateString()
                    }
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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

      {/* Reschedule Confirmation Popup */}
      {showRescheduleConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="max-w-md w-full mx-4">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4">Reschedule Match?</h3>
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-3">
                  You already have a match scheduled with <strong>{showRescheduleConfirmation.opponentName}</strong>:
                </p>
                <div className="bg-gray-100 p-3 rounded mb-3">
                  <div className="text-sm">
                    <strong>Current match:</strong><br/>
                    {new Date(showRescheduleConfirmation.existingMatch.startAt).toLocaleDateString()} at{' '}
                    {new Date(showRescheduleConfirmation.existingMatch.startAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                  </div>
                </div>
                <div className="bg-blue-50 p-3 rounded">
                  <div className="text-sm">
                    <strong>Reschedule to:</strong><br/>
                    {new Date(showRescheduleConfirmation.newTime).toLocaleDateString()} at{' '}
                    {new Date(showRescheduleConfirmation.newTime).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-6">
                Would you like to reschedule your existing match to this new time?
              </p>
              <div className="flex gap-3">
                <Button onClick={rescheduleMatch} className="flex-1">
                  Yes, Reschedule
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowRescheduleConfirmation(null)} 
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="max-w-md w-full mx-4">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4">Cancel Match?</h3>
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-3">
                  Are you sure you want to cancel this match?
                </p>
                <div className="bg-red-50 p-3 rounded border-l-4 border-red-400 mb-4">
                  <div className="text-sm">
                    <strong>{showCancelConfirmation.matchInfo}</strong>
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reason for cancellation (optional):
                  </label>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Let your opponents know why you're cancelling..."
                    className="w-full p-2 border border-gray-300 rounded-md resize-none"
                    rows={3}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This message will be included in the cancellation email sent to your opponents.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button 
                  onClick={() => {
                    cancelMatch(showCancelConfirmation.matchId, cancelReason.trim() || undefined);
                    setShowCancelConfirmation(null);
                    setCancelReason("");
                  }} 
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  Yes, Cancel Match
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowCancelConfirmation(null);
                    setCancelReason("");
                  }} 
                  className="flex-1"
                >
                  Keep Match
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bottom Left Settings Menu */}
      <div className="fixed bottom-4 left-2 sm:bottom-6 sm:left-6 z-[9999]" style={{ zIndex: 9999 }}>
        <div className="flex flex-col items-start gap-1 sm:gap-2">
          {/* Expanded settings */}
          {showMobileActions && (
            <div className="flex flex-col items-start gap-1 mb-1">
              <Button 
                onClick={loadAllData} 
                variant="outline"
                size="sm"
                className="shadow-lg hover:shadow-xl transition-shadow text-xs sm:text-sm"
              >
                🔄 <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Button 
                onClick={() => setShowClearConfirmation(true)}
                variant="outline"
                size="sm"
                className="shadow-lg hover:shadow-xl transition-shadow text-xs sm:text-sm"
              >
                🗑️ <span className="hidden sm:inline">Clear All Unconfirmed</span>
              </Button>
              <Button 
                onClick={performUndo}
                variant="outline" 
                size="sm"
                disabled={undoStack.length === 0}
                className="shadow-lg hover:shadow-xl transition-shadow text-xs sm:text-sm"
              >
                ↶ <span className="hidden sm:inline">Undo ({undoStack.length})</span><span className="sm:hidden">({undoStack.length})</span>
              </Button>
              <Button 
                onClick={() => setShowHiddenTeams(!showHiddenTeams)}
                variant={showHiddenTeams ? "default" : "outline"}
                size="sm"
                className="shadow-lg hover:shadow-xl transition-shadow text-xs sm:text-sm"
              >
                👁️ <span className="hidden sm:inline">{showHiddenTeams ? "Hide" : "Show"} Matched Teams</span>
              </Button>
              <Button
                variant={showWeather ? "default" : "outline"}
                size="sm"
                onClick={() => setShowWeather(!showWeather)}
                className="shadow-lg hover:shadow-xl transition-shadow text-xs sm:text-sm"
              >
                🌤️ <span className="hidden sm:inline">{showWeather ? "Hide" : "Show"} Weather</span>
              </Button>
            </div>
          )}
          
          {/* Settings toggle button */}
          <Button 
            onClick={() => setShowMobileActions(!showMobileActions)}
            variant="outline"
            size="sm"
            className="shadow-lg hover:shadow-xl transition-shadow text-xs sm:text-sm"
          >
            {showMobileActions ? '✕' : '⚙️'} <span className="hidden sm:inline">{showMobileActions ? 'Close' : 'Settings'}</span>
          </Button>
        </div>
      </div>

      {/* Bottom Right Action Buttons */}
      <div className="fixed bottom-4 right-2 sm:bottom-6 sm:right-6 z-[9999]" style={{ zIndex: 9999 }}>
        <div className="flex flex-col items-end gap-1 sm:gap-2">
          {saveMsg && (
            <div className="bg-white border border-gray-200 rounded-lg px-2 py-1 sm:px-3 sm:py-2 shadow-lg max-w-[200px] sm:max-w-none">
              <span className="text-xs sm:text-sm text-muted-foreground">{saveMsg}</span>
            </div>
          )}
          <Button 
            onClick={() => {
              setIsBlockSelectMode(!isBlockSelectMode);
              setBlockSelectCorners([]);
              setSelectedSlots(new Set());
            }}
            variant={isBlockSelectMode ? "default" : "outline"}
            className="shadow-lg hover:shadow-xl transition-shadow text-xs sm:text-sm"
            size="sm"
          >
            <span className="sm:hidden">{isBlockSelectMode ? "Exit Block" : "Block"}</span>
            <span className="hidden sm:inline">{isBlockSelectMode ? "Exit Block Select" : "Block Select"}</span>
          </Button>
          {/* Save button - only show when there are changes */}
          {(myAvail.size > 0 || myUnavail.size > 0 || partnerAvail.size > 0 || proxyModifiedSlots.size > 0) && (
            <Button 
              onClick={saveAvailability} 
              disabled={saving || !!isAfterEndDate}
              className="shadow-lg hover:shadow-xl transition-shadow text-sm sm:text-base"
              size="lg"
            >
              <span className="sm:hidden">{saving ? "Saving…" : isAfterEndDate ? "Ended" : "Save"}</span>
              <span className="hidden sm:inline">{saving ? "Saving…" : isAfterEndDate ? "Ladder Ended" : "Save Changes"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Mobile Date Range Picker Modal */}
      {showDateRangePicker && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div 
            className="absolute inset-0 bg-black bg-opacity-50" 
            onClick={() => setShowDateRangePicker(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Select Week</h3>
              <button
                onClick={() => setShowDateRangePicker(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    setWeekStart(prev => addDays(prev, -7));
                    setDayOffset(0);
                  }}
                  className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200"
                >
                  ← Previous Week
                </button>
                <div className="text-center">
                  <div className="font-medium">
                    {formatDate(weekStart)} - {formatDate(addDays(weekStart, 6))}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setWeekStart(prev => addDays(prev, 7));
                    setDayOffset(0);
                  }}
                  className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200"
                >
                  Next Week →
                </button>
              </div>
              
              <button
                onClick={() => {
                  setWeekStart(startOfWeekMonday(new Date()));
                  setDayOffset(0);
                  setShowDateRangePicker(false);
                }}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Go to This Week
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Brownian Solutions Branding */}
      <div className="mt-6 text-center text-xs text-muted-foreground border-t pt-4">
        <div className="flex items-center justify-center gap-2">
          <span>Made by</span>
          <a 
            href="https://brownian.solutions" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors font-medium flex items-center gap-2"
          >
            <img 
              src="/brownian-solutions-logo.png" 
              alt="Brownian Solutions" 
              width="20" 
              height="20"
              className="inline-block"
            />
            Brownian Solutions
          </a>
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
        // Reload all matches to show the confirmed match
        console.log('Reloading data after match confirmation...');
        const ladderId = ladderInfo?.currentLadder?.id;
        const matchesResponse = await fetch(`/api/matches/all${ladderId ? `?ladderId=${ladderId}` : ''}`);
        if (matchesResponse.ok) {
          const matchesData = await matchesResponse.json();
          setAllMatches(matchesData.matches);
          // Update current week data with new matches
          updateCurrentWeekData();
        }
        setTimeout(() => setSaveMsg(""), 3000);
      } else if (response.status === 409) {
        // Conflict - existing match found, show reschedule popup
        const conflictData = await response.json();
        const currentOpponentTeamId = opponentTeamId;
        const opponentTeam = teamsData.teams.find(t => t.id === currentOpponentTeamId);
        const opponentName = opponentTeam ? 
          `${opponentTeam.member1.name || opponentTeam.member1.email}${
            opponentTeam.member2 && opponentTeam.member2.id !== opponentTeam.member1.id 
              ? ` & ${opponentTeam.member2.name || opponentTeam.member2.email}` 
              : ''
          }` : 'Unknown Team';
        
        setShowRescheduleConfirmation({
          existingMatch: conflictData.existingMatch,
          newTime: conflictData.requestedTime,
          opponentName
        });
        setShowMatchConfirmation(null);
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

  async function rescheduleMatch() {
    if (!showRescheduleConfirmation) return;
    
    try {
      const response = await fetch('/api/matches/reschedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: showRescheduleConfirmation.existingMatch.id,
          newTime: showRescheduleConfirmation.newTime
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Match reschedule response:', data);
        setSaveMsg("Match rescheduled successfully!");
        setShowRescheduleConfirmation(null);
        // Reload all matches to show the rescheduled match
        const ladderId = ladderInfo?.currentLadder?.id;
        const matchesResponse = await fetch(`/api/matches/all${ladderId ? `?ladderId=${ladderId}` : ''}`);
        if (matchesResponse.ok) {
          const matchesData = await matchesResponse.json();
          setAllMatches(matchesData.matches);
          // Update current week data with new matches
          updateCurrentWeekData();
        }
        setTimeout(() => setSaveMsg(""), 3000);
      } else {
        const error = await response.json();
        setSaveMsg(error.error || "Failed to reschedule match");
        setTimeout(() => setSaveMsg(""), 3000);
      }
    } catch (error) {
      setSaveMsg("Network error");
      setTimeout(() => setSaveMsg(""), 3000);
    }
  }

  async function cancelMatch(matchId: string, reason?: string) {
    try {
      const response = await fetch('/api/matches/cancel', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, reason }),
      });

      if (response.ok) {
        await response.json();
        setSaveMsg("Match cancelled successfully!");
        // Reload all matches to remove the cancelled match
        const ladderId = ladderInfo?.currentLadder?.id;
        const matchesResponse = await fetch(`/api/matches/all${ladderId ? `?ladderId=${ladderId}` : ''}`);
        if (matchesResponse.ok) {
          const matchesData = await matchesResponse.json();
          setAllMatches(matchesData.matches);
          // Update current week data with updated matches
          updateCurrentWeekData();
        }
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
  onShowCancelConfirmation,
  actingAsTeam,
  actingAsPlayer,
  proxyAvail,
  proxyUnavail,
  selectedSlots,
  blockSelectCorners,
  isBlockSelectMode,
  onBlockSelectClick,
  ladderInfo,
  showEarlyTimes,
  showLateTimes,
  showHiddenTeams,
  showWeather,
  weatherCanLoad,
  isFullScreen
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
  onShowCancelConfirmation: (confirmation: { matchId: string; matchInfo: string }) => void;
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
  showEarlyTimes: boolean;
  showLateTimes: boolean;
  showHiddenTeams: boolean;
  showWeather: boolean;
  weatherCanLoad: boolean;
  isFullScreen?: boolean;
}) {
  const [clickTimeout, setClickTimeout] = useState<NodeJS.Timeout | null>(null);
  
  // Get other teams, conditionally excluding those with confirmed matches
  const otherTeams = teamsData.teams.filter(team => {
    if (team.id === teamsData.myTeamId) return false; // Skip my team
    
    // Check if we already have a confirmed match with this team
    const myTeamId = teamsData.myTeamId;
    if (myTeamId && teamsData.matches) {
      const [team1Id, team2Id] = [myTeamId, team.id].sort();
      const existingMatch = teamsData.matches.find(match => 
        match.team1Id === team1Id && match.team2Id === team2Id && !match.completed
      );
      
      if (existingMatch) {
        console.log('Team has existing match:', {
          teamId: team.id,
          myTeamId: myTeamId,
          matchId: existingMatch.id,
          matchTime: existingMatch.startAt,
          showHiddenTeams: showHiddenTeams
        });
        
        // Only hide if showHiddenTeams is false
        if (!showHiddenTeams) {
          return false; // Hide teams with existing matches
        }
      }
    }
    
    return true;
  });

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
          // Get team names for the modal
          const team1 = teamsData.teams.find(t => t.id === confirmedMatch.team1Id);
          const team2 = teamsData.teams.find(t => t.id === confirmedMatch.team2Id);
          const team1Name = team1 ? `${team1.member1.name || team1.member1.email}${team1.member2 ? ` & ${team1.member2.name || team1.member2.email}` : ''}` : 'Team 1';
          const team2Name = team2 ? `${team2.member1.name || team2.member1.email}${team2.member2 ? ` & ${team2.member2.name || team2.member2.email}` : ''}` : 'Team 2';
          const matchTime = new Date(confirmedMatch.startAt).toLocaleString('en-GB', {
            weekday: 'long',
            year: 'numeric',
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/London',
            timeZoneName: 'short'
          });
          
          onShowCancelConfirmation({
            matchId: confirmedMatch.id,
            matchInfo: `${team1Name} vs ${team2Name} on ${matchTime}`
          });
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
          {/* Match label or score */}
          <div className="absolute inset-0 flex items-center justify-center">
            {confirmedMatch.completed && confirmedMatch.team1Score !== null && confirmedMatch.team2Score !== null ? (
              // Show score for completed matches (clickable to edit)
              <div 
                className="flex items-center gap-1 text-xs font-semibold cursor-pointer hover:bg-black/10 rounded px-1 py-0.5 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.href = '/scoring';
                }}
                title="Click to edit scores"
              >
                <div className={`px-1.5 py-0.5 rounded text-white min-w-[20px] text-center ${
                  (confirmedMatch.team1Score ?? 0) > (confirmedMatch.team2Score ?? 0) ? 'bg-green-500' : 'bg-red-500'
                }`}>
                  {confirmedMatch.team1Score}
                </div>
                <div className="text-white text-xs">-</div>
                <div className={`px-1.5 py-0.5 rounded text-white min-w-[20px] text-center ${
                  (confirmedMatch.team2Score ?? 0) > (confirmedMatch.team1Score ?? 0) ? 'bg-green-500' : 'bg-red-500'
                }`}>
                  {confirmedMatch.team2Score}
                </div>
              </div>
            ) : (
              // Show "MATCH" for scheduled but not completed matches
              <span className="text-xs text-white bg-red-600 bg-opacity-90 px-1 rounded font-semibold">
                MATCH
              </span>
            )}
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
                
                // Start with existing state and apply proxy modifications
                member1Available = member1ExistingAvail;
                member1Unavailable = false;
                
                // Apply proxy modifications only for this specific member
                if (member1ProxyAvail) {
                  member1Available = true;
                  member1Unavailable = false;
                } else if (member1ProxyUnavail) {
                  member1Available = false;
                  member1Unavailable = true;
                }
                // If no proxy state, keep existing state
                member2Available = team.member2?.availability.includes(slotKey) || false;
              } else if (actingAsPlayer === team.member2?.id) {
                // Acting as member 2 only - show existing OR proxy state
                member1Available = team.member1.availability.includes(slotKey);
                const member2ExistingAvail = team.member2?.availability.includes(slotKey) || false;
                const member2ProxyAvail = proxyAvail.has(slotKey);
                const member2ProxyUnavail = proxyUnavail.has(slotKey);
                
                // Start with existing state and apply proxy modifications
                member2Available = member2ExistingAvail;
                member2Unavailable = false;
                
                // Apply proxy modifications only for this specific member
                if (member2ProxyAvail) {
                  member2Available = true;
                  member2Unavailable = false;
                } else if (member2ProxyUnavail) {
                  member2Available = false;
                  member2Unavailable = true;
                }
                // If no proxy state, keep existing state
              } else {
                // Acting for both members - show existing OR proxy state for each
                const member1ExistingAvail = team.member1.availability.includes(slotKey);
                const member2ExistingAvail = team.member2?.availability.includes(slotKey) || false;
                const proxyAvailForSlot = proxyAvail.has(slotKey);
                const proxyUnavailForSlot = proxyUnavail.has(slotKey);
                
                // Always start with the existing availability as the base
                member1Available = member1ExistingAvail;
                member2Available = member2ExistingAvail;
                member1Unavailable = false;
                member2Unavailable = false;
                
                // Apply proxy modifications on top of existing state
                if (proxyAvailForSlot) {
                  // Proxy says available - override to available
                  member1Available = true;
                  member2Available = true;
                  member1Unavailable = false;
                  member2Unavailable = false;
                } else if (proxyUnavailForSlot) {
                  // Proxy says unavailable - override to unavailable
                  member1Available = false;
                  member2Available = false;
                  member1Unavailable = true;
                  member2Unavailable = true;
                }
                // If no proxy state, keep the existing availability (no override)
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
                className={`relative flex flex-col ${actingAsTeam === team.id ? 'ring-2 ring-blue-400 ring-inset' : ''}`}
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
              // Use both team data and local state to ensure proper detection
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
    <div className="rounded-none sm:rounded-2xl shadow-none sm:shadow overflow-hidden">
      <div className={`overflow-auto ${isFullScreen ? 'h-full' : 'max-h-[80vh]'}`}>
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-20 bg-white">
            <tr>
              <th className={`bg-white border p-2 text-left shadow-sm ${isFullScreen ? 'sticky left-0 z-30' : ''}`}>Time</th>
              {days.map((d, i) => {
                if (!d) return <th key={i} className="bg-white border p-2 text-left min-w-[120px] shadow-sm">Loading...</th>;
                const dayOfWeek = d.getDay();
                const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert Sunday=0 to Monday=0 indexing
                return (
                  <th key={i} className="bg-white border p-2 text-left min-w-[120px] shadow-sm">{DAY_LABELS[dayIndex]}<div className="text-xs text-muted-foreground">{d.toLocaleDateString()}</div></th>
                );
              })}
            </tr>
          </thead>
        <tbody>
          {(() => {
            // Define time ranges
            const earlyHours = [6, 7, 8, 9]; // 6am-9:30am (4 hours = 8 slots)
            const normalHours = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]; // 10am-8:30pm (11 hours = 22 slots)  
            const lateHours = [21]; // 9pm-9:30pm (1 hour = 2 slots)
            
            // Determine which hours to show
            let hoursToShow = [...normalHours];
            if (showEarlyTimes) {
              hoursToShow = [...earlyHours, ...hoursToShow];
            }
            if (showLateTimes) {
              hoursToShow = [...hoursToShow, ...lateHours];
            }
            
            // Generate rows for each half-hour slot
            const rows: JSX.Element[] = [];
            hoursToShow.forEach((hour, hourIndex) => {
              // Add 00 minute slot
              const minute0 = 0;
              const rowLabel0 = timeLabel(hour, minute0);
              const r0 = hourIndex * 2;
              rows.push(
                <tr key={`${hour}-00`} className="odd:bg-muted/20">
                  <td className={`bg-white border p-2 align-top text-sm font-medium ${isFullScreen ? 'sticky left-0 z-10' : ''}`}>{rowLabel0}</td>
                  {days.map((d, c) => {
                    const key = isoAt(d, hour, minute0);
                    return (
                      <td key={c} className="p-0 align-top w-32 relative">
                        <TimeSlotVisual slotKey={key} rowLabel={rowLabel0} />
                        <WeatherCell slotKey={key} showWeather={showWeather} canLoadWeather={weatherCanLoad} />
                      </td>
                    );
                  })}
                </tr>
              );
              
              // Add 30 minute slot
              const minute30 = 30;
              const rowLabel30 = timeLabel(hour, minute30);
              const r30 = hourIndex * 2 + 1;
              rows.push(
                <tr key={`${hour}-30`} className="odd:bg-muted/20">
                  <td className={`bg-white border p-2 align-top text-sm font-medium ${isFullScreen ? 'sticky left-0 z-10' : ''}`}>{rowLabel30}</td>
                  {days.map((d, c) => {
                    const key = isoAt(d, hour, minute30);
                    return (
                      <td key={c} className="p-0 align-top w-32 relative">
                        <TimeSlotVisual slotKey={key} rowLabel={rowLabel30} />
                        <WeatherCell slotKey={key} showWeather={showWeather} canLoadWeather={weatherCanLoad} />
                      </td>
                    );
                  })}
                </tr>
              );
            });
            
            return rows;
          })()}
        </tbody>
      </table>
      </div>
    </div>
  );
}