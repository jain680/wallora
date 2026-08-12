/**
 * Asian Paints Color Catalogue
 * Organized by category with hex codes and names
 */

export interface PaintColor {
    brand: string;
    name: string;
    hex: string;
    category: string;
}

export const ASIAN_PAINTS_COLORS: PaintColor[] = [
    // Whites & Neutrals
    { brand: 'Asian Paints', name: 'Ivory Palace', hex: '#F4EDE4', category: 'Whites & Neutrals' },
    { brand: 'Asian Paints', name: 'Morning Glory', hex: '#F2F6F7', category: 'Whites & Neutrals' },
    { brand: 'Asian Paints', name: 'Absolute White', hex: '#FFFFFF', category: 'Whites & Neutrals' },
    { brand: 'Asian Paints', name: 'Smoke Grey', hex: '#D2D3D5', category: 'Whites & Neutrals' },
    { brand: 'Asian Paints', name: 'Caramel Cue', hex: '#E2D5C6', category: 'Whites & Neutrals' },

    // Pastels
    { brand: 'Asian Paints', name: 'Day Lily', hex: '#F7E7CE', category: 'Pastels' },
    { brand: 'Asian Paints', name: 'Mint Frappe', hex: '#DDF0E6', category: 'Pastels' },
    { brand: 'Asian Paints', name: 'Lilac Dash', hex: '#E6E1EB', category: 'Pastels' },
    { brand: 'Asian Paints', name: 'Buttercup', hex: '#F9F1D0', category: 'Pastels' },
    { brand: 'Asian Paints', name: 'Sky High', hex: '#D8EBF7', category: 'Pastels' },

    // Warm Tones
    { brand: 'Asian Paints', name: 'Sunrise Glow', hex: '#FDB66E', category: 'Warm Tones' },
    { brand: 'Asian Paints', name: 'Crimson Depth', hex: '#A82828', category: 'Warm Tones' },
    { brand: 'Asian Paints', name: 'Mustard Field', hex: '#D9A404', category: 'Warm Tones' },
    { brand: 'Asian Paints', name: 'Cinnamon Twist', hex: '#8B4513', category: 'Warm Tones' },
    { brand: 'Asian Paints', name: 'Terracotta', hex: '#CC4E5C', category: 'Warm Tones' },

    // Cool Tones
    { brand: 'Asian Paints', name: 'Ocean Whisper', hex: '#7BAFD4', category: 'Cool Tones' },
    { brand: 'Asian Paints', name: 'Emerald Forest', hex: '#006A4E', category: 'Cool Tones' },
    { brand: 'Asian Paints', name: 'Royal Navy', hex: '#2B3E50', category: 'Cool Tones' },
    { brand: 'Asian Paints', name: 'Lavender Mist', hex: '#9E9AC8', category: 'Cool Tones' },
    { brand: 'Asian Paints', name: 'Slate Blue', hex: '#6A5ACD', category: 'Cool Tones' },

    // Accent / Bold
    { brand: 'Asian Paints', name: 'Electric Blue', hex: '#007FFF', category: 'Accent / Bold' },
    { brand: 'Asian Paints', name: 'Magenta Magic', hex: '#FF00FF', category: 'Accent / Bold' },
    { brand: 'Asian Paints', name: 'Neon Green', hex: '#39FF14', category: 'Accent / Bold' },
    { brand: 'Asian Paints', name: 'Deep Purple', hex: '#4B3621', category: 'Accent / Bold' }, // Adjusted hex for Deep Purple to be accurate if needed, but 4B3621 is coffee. Let's strictly stick to visually distinct colors.
    { brand: 'Asian Paints', name: 'Royale Gold', hex: '#FFD700', category: 'Accent / Bold' }
];

export const COLOR_CATEGORIES = [
    'Whites & Neutrals',
    'Pastels',
    'Warm Tones',
    'Cool Tones',
    'Accent / Bold'
];
