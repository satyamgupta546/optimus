/**
 * ValidationService — Frontend Pre-Submit Validation
 *
 * Runs WidgetRegistry.getValidationRules() per widget before submission.
 * Slug is passed through as-is — no uniqueness check, no auto-increment.
 * The same slug created by SlugBuilder is stored directly in BigQuery.
 *
 * Wiki Reference: wiki/Backend-work-flow.md — Pre-Submit Validation
 */

import { WidgetRegistry } from '../config/WidgetRegistry';

// ── Field Validation Helpers ───────────────────────────────────────────────

const validators = {
    required: (value) => {
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') return value.trim().length > 0;
        if (Array.isArray(value)) return value.length > 0;
        return true;
    },
    'minItems:1': (value) =>
        Array.isArray(value) && value.length >= 1,
    'minLength:3': (value) =>
        typeof value === 'string' && value.trim().length >= 3,
    'format:datetime': (value) => {
        if (!value) return true; // Optional — only validate format if present
        // Accept multiple formats:
        //   YYYY-MM-DD HH:MM:SS, YYYY-MM-DDTHH:MM, DD Mon YYYY HH:MM
        return /^(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}(:\d{2})?|\d{1,2} \w{3} \d{4} \d{2}:\d{2})/.test(value);
    },
};

const runRule = (rule, value) => {
    const fn = validators[rule];
    if (!fn) return true; // Unknown rule — skip
    return fn(value);
};

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * validateWidgets(widgets)
 *
 * Validates all widgets against their WidgetRegistry rules.
 * Returns { valid: bool, errors: [{widgetId, widgetTitle, field, message}] }
 */
export const validateWidgets = (widgets = []) => {
    const errors = [];

    for (const widget of widgets) {
        const rules = WidgetRegistry.getValidationRules(widget.type, widget) || [];

        for (const rule of rules) {
            // Normalize: slug field may live in 'slug_name' on fetched widgets
            let fieldValue = widget[rule.field];
            if (rule.field === 'slug' && !fieldValue) {
                fieldValue = widget.slug_name;
            }
            const passes = runRule(rule.rule, fieldValue);

            if (!passes) {
                errors.push({
                    widgetId: widget.id,
                    widgetTitle: widget.title || widget.type || 'Untitled Widget',
                    field: rule.field,
                    message: rule.errorMessage || rule.error || `${rule.field} is invalid.`,
                });
            }
        }
    }

    return { valid: errors.length === 0, errors };
};

/**
 * validateAndCheckSlugs(widgets)
 *
 * Field-level validation only. Slug is passed through as-is to BigQuery.
 * No uniqueness check — the slug created by SlugBuilder is the final slug.
 *
 * Returns { valid: bool, errors: [...] }
 */
export const validateAndCheckSlugs = async (widgets = []) => {
    const fieldResult = validateWidgets(widgets);
    return { valid: fieldResult.errors.length === 0, errors: fieldResult.errors };
};

export default { validateWidgets, validateAndCheckSlugs };
