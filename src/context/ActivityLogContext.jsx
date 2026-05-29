import React, { createContext, useContext, useState, useCallback } from 'react';
import { LocalApiService } from '../services/LocalApiService';
import { safeUUID } from '../utils/uuid';

const ActivityLogContext = createContext();

export const useActivityLog = () => {
    const context = useContext(ActivityLogContext);
    if (!context) {
        throw new Error('useActivityLog must be used within ActivityLogProvider');
    }
    return context;
};

/**
 * Activity Log Provider
 * Tracks all user actions for audit trail
 */
export const ActivityLogProvider = ({ children }) => {
    const [activities, setActivities] = useState([]);
    const [maxActivities] = useState(100); // Keep last 100 activities

    /**
     * Log an activity.
     * Significant lifecycle actions (submit, approve, reject) are also
     * persisted to Google Sheet via appendAuditLog.
     */
    const logActivity = useCallback((action, details = {}, user = 'Current User') => {
        const activity = {
            id: safeUUID(),
            action, // 'widget_added', 'widget_deleted', 'page_submitted', etc.
            details,
            user,
            timestamp: new Date().toISOString(),
        };

        setActivities(prev => {
            const newActivities = [activity, ...prev];
            if (newActivities.length > maxActivities) {
                return newActivities.slice(0, maxActivities);
            }
            return newActivities;
        });

        // Persist significant lifecycle events to local backend
        const PERSIST_ACTIONS = ['page_submitted', 'page_approved', 'page_rejected'];
        if (PERSIST_ACTIONS.includes(action) && details.requestId) {
            // Fire-and-forget — non-blocking (skip if no requestId)
            LocalApiService.appendActivity({
                action,
                details,
                targetId: details.requestId,
            }).catch(e => console.warn('[ActivityLogContext] appendActivity error:', e));
        }

        return activity;
    }, [maxActivities]);

    /**
     * Get activities by type
     */
    const getActivitiesByType = useCallback((action) => {
        return activities.filter(a => a.action === action);
    }, [activities]);

    /**
     * Get recent activities
     */
    const getRecentActivities = useCallback((count = 10) => {
        return activities.slice(0, count);
    }, [activities]);

    /**
     * Clear all activities
     */
    const clearActivities = useCallback(() => {
        setActivities([]);
    }, []);

    /**
     * Export activities as JSON
     */
    const exportActivities = useCallback(() => {
        return JSON.stringify(activities, null, 2);
    }, [activities]);

    const value = {
        activities,
        logActivity,
        getActivitiesByType,
        getRecentActivities,
        clearActivities,
        exportActivities,
    };

    return (
        <ActivityLogContext.Provider value={value}>
            {children}
        </ActivityLogContext.Provider>
    );
};
