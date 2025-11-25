import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * AvaturnAPI - Handles Avaturn/In3D API authentication and avatar fetching
 */
export class AvaturnAPI {
  constructor() {
    this.baseUrl = 'https://api.avaturn.dev';
    this.token = null;
    this.userId = null;
  }

  /**
   * Set authentication token
   * @param {string} token - Firebase JWT token from Avaturn
   */
  setToken(token) {
    this.token = token;
    
    // Decode JWT to get user ID (simple decode, no verification needed client-side)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      this.userId = payload.user_id;
      console.log('[AVATURN] Token set for user:', this.userId);
    } catch (error) {
      console.error('[AVATURN] Failed to decode token:', error);
    }
  }

  /**
   * Fetch user's avatar list
   * @returns {Promise<Array>} List of user's avatars
   */
  async fetchAvatars() {
    if (!this.token) {
      throw new Error('No authentication token set');
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/avatars`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch avatars: ${response.status}`);
      }

      const data = await response.json();
      console.log('[AVATURN] Fetched avatars:', data);
      return data.avatars || data;
    } catch (error) {
      console.error('[AVATURN] Error fetching avatars:', error);
      return [];
    }
  }

  /**
   * Get avatar GLB URL
   * @param {string} avatarId - Avatar ID
   * @returns {Promise<string>} URL to avatar GLB file
   */
  async getAvatarUrl(avatarId) {
    if (!this.token) {
      throw new Error('No authentication token set');
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/avatars/${avatarId}`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch avatar: ${response.status}`);
      }

      const data = await response.json();
      
      // Return GLB URL (format may vary based on Avaturn API version)
      return data.url || data.glbUrl || data.model_url;
    } catch (error) {
      console.error('[AVATURN] Error fetching avatar URL:', error);
      return null;
    }
  }

  /**
   * Get user's default/latest avatar
   * @returns {Promise<string>} URL to default avatar GLB
   */
  async getDefaultAvatarUrl() {
    const avatars = await this.fetchAvatars();
    
    if (avatars.length === 0) {
      console.warn('[AVATURN] No avatars found for user');
      return null;
    }

    // Get the most recent avatar (usually first in list)
    const defaultAvatar = avatars[0];
    return this.getAvatarUrl(defaultAvatar.id);
  }
}

/**
 * Store Avaturn token in localStorage
 */
export function storeAvaturnToken(token) {
  localStorage.setItem('avaturn_token', token);
  console.log('[AVATURN] Token stored in localStorage');
}

/**
 * Load Avaturn token from localStorage
 */
export function loadAvaturnToken() {
  const token = localStorage.getItem('avaturn_token');
  if (token) {
    console.log('[AVATURN] Token loaded from localStorage');
  }
  return token;
}

/**
 * Clear Avaturn token
 */
export function clearAvaturnToken() {
  localStorage.removeItem('avaturn_token');
  console.log('[AVATURN] Token cleared');
}
