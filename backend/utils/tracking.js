const crypto = require('crypto');

/**
 * Generate a device fingerprint from request headers
 * This combines multiple factors to create a unique identifier
 */
function generateDeviceFingerprint(req) {
  const userAgent = req.headers['user-agent'] || '';
  const acceptLanguage = req.headers['accept-language'] || '';
  const acceptEncoding = req.headers['accept-encoding'] || '';
  const ipAddress = req.ip || req.connection.remoteAddress || '';
  
  // Combine multiple headers to create fingerprint
  const fingerprintString = `${userAgent}|${acceptLanguage}|${acceptEncoding}|${ipAddress}`;
  
  // Create a hash for consistent fingerprint
  return crypto.createHash('sha256').update(fingerprintString).digest('hex').substring(0, 32);
}

/**
 * Get anonymous ID (hash of fingerprint + IP)
 */
function generateAnonymousId(deviceFingerprint, ipAddress) {
  const combined = `${deviceFingerprint}|${ipAddress}`;
  return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 24);
}

/**
 * Extract location info from request
 */
function getLocationInfo(req) {
  return {
    ipAddress: req.ip || req.connection.remoteAddress || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'] || '',
    latitude: req.body?.latitude || req.query?.latitude,
    longitude: req.body?.longitude || req.query?.longitude,
    constituency: req.body?.constituency || req.query?.constituency,
    state: req.body?.state || req.query?.state,
    city: req.body?.city || req.query?.city,
  };
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if user is within voting radius (50km default)
 */
function isWithinRadius(userLat, userLon, targetLat, targetLon, radiusKm = 50) {
  if (!userLat || !userLon || !targetLat || !targetLon) {
    return true; // Allow if location not provided
  }
  const distance = calculateDistance(userLat, userLon, targetLat, targetLon);
  return distance <= radiusKm;
}

module.exports = {
  generateDeviceFingerprint,
  generateAnonymousId,
  getLocationInfo,
  calculateDistance,
  isWithinRadius,
};

