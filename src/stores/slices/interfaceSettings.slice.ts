import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface InterfaceSettingsState {
    language: string;
    timezone: string;
    notifyTimezoneChanges: boolean;
    weekStart: 'sunday' | 'monday';
    timeFormat: '12h' | '24h';
    dateFormat: 'mm/dd/yyyy' | 'dd/mm/yyyy' | 'yyyy/mm/dd';
    showAgentIcon: boolean;
    showMessageIcon: boolean;
    showCommandBar: boolean;
    showCreditBadge: boolean;
    commandInterfaceOpen: boolean;
}

const getInitialTimezone = () => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
        return 'UTC';
    }
};

const initialState: InterfaceSettingsState = {
    language: 'en',
    timezone: getInitialTimezone(),
    notifyTimezoneChanges: true,
    weekStart: 'sunday',
    timeFormat: '12h',
    dateFormat: 'mm/dd/yyyy',
    showAgentIcon: false,
    showMessageIcon: true,
    showCommandBar: true,
    showCreditBadge: true,
    commandInterfaceOpen: false,
};

const interfaceSettingsSlice = createSlice({
    name: 'interfaceSettings',
    initialState,
    reducers: {
        setLanguage: (state, action: PayloadAction<string>) => {
            state.language = action.payload;
        },
        setTimezone: (state, action: PayloadAction<string>) => {
            state.timezone = action.payload;
        },
        setNotifyTimezoneChanges: (state, action: PayloadAction<boolean>) => {
            state.notifyTimezoneChanges = action.payload;
        },
        setWeekStart: (state, action: PayloadAction<'sunday' | 'monday'>) => {
            state.weekStart = action.payload;
        },
        setTimeFormat: (state, action: PayloadAction<'12h' | '24h'>) => {
            state.timeFormat = action.payload;
        },
        setDateFormat: (state, action: PayloadAction<'mm/dd/yyyy' | 'dd/mm/yyyy' | 'yyyy/mm/dd'>) => {
            state.dateFormat = action.payload;
        },
        setShowAgentIcon: (state, action: PayloadAction<boolean>) => {
            state.showAgentIcon = action.payload;
        },
        setShowMessageIcon: (state, action: PayloadAction<boolean>) => {
            state.showMessageIcon = action.payload;
        },
        setShowCommandBar: (state, action: PayloadAction<boolean>) => {
            state.showCommandBar = action.payload;
        },
        setShowCreditBadge: (state, action: PayloadAction<boolean>) => {
            state.showCreditBadge = action.payload;
        },
        setCommandInterfaceOpen: (state, action: PayloadAction<boolean>) => {
            state.commandInterfaceOpen = action.payload;
        },
        resetInterfaceSettings: () => ({
            ...initialState,
            timezone: getInitialTimezone(),
        }),
    },
});

export const {
    setLanguage,
    setTimezone,
    setNotifyTimezoneChanges,
    setWeekStart,
    setTimeFormat,
    setDateFormat,
    setShowAgentIcon,
    setShowMessageIcon,
    setShowCommandBar,
    setShowCreditBadge,
    setCommandInterfaceOpen,
    resetInterfaceSettings,
} = interfaceSettingsSlice.actions;

export default interfaceSettingsSlice.reducer;
