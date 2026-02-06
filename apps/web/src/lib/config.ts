/**
 * Application Configuration
 * Determines whether to use mock services or real API calls
 */

export const config = {
  /**
   * Use mock services (fake data from localStorage)
   * Set to false to use real API
   */
  USE_MOCK_SERVICES:
    process.env.NEXT_PUBLIC_USE_MOCK === 'true' ||
    (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_API_URL),

  /**
   * API URL (from environment or default)
   */
  API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',

  /**
   * Enable debug logging
   */
  DEBUG: process.env.NODE_ENV === 'development'
} as const;

// Log configuration in development
if (config.DEBUG) {
  console.log('🔧 App Configuration:', {
    USE_MOCK_SERVICES: config.USE_MOCK_SERVICES,
    API_URL: config.API_URL,
    NODE_ENV: process.env.NODE_ENV
  });
}
