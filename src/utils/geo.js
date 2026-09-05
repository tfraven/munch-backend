/**
 * Geo calculation utilities using Haversine formula
 */

/**
 * Calculates distance in kilometers between two [longitude, latitude] points
 * @param {Array<number>} coord1 - [lng1, lat1]
 * @param {Array<number>} coord2 - [lng2, lat2]
 * @returns {number} distance in kilometers
 */
const calculateDistanceKm = (coord1, coord2) => {
  if (!coord1 || !coord2 || coord1.length !== 2 || coord2.length !== 2) {
    return 0;
  }

  const [lng1, lat1] = coord1;
  const [lng2, lat2] = coord2;

  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371; // Earth radius in km

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 100) / 100; // 2 decimal places
};

/**
 * Calculates delivery fee based on distance
 * @param {number} distanceKm
 * @returns {number} delivery fee
 */
const calculateDeliveryFee = (distanceKm) => {
  if (!distanceKm || distanceKm <= 0) return 1.5; // minimum base fee
  
  const baseFee = 2.0; // base fee for first 2 km
  const perKmRate = 0.8; // $0.80 per additional km
  
  if (distanceKm <= 2) {
    return baseFee;
  }

  const extraKm = distanceKm - 2;
  const totalFee = baseFee + extraKm * perKmRate;
  return Math.round(totalFee * 100) / 100;
};

/**
 * Estimates delivery duration in minutes based on prep time and distance
 * Assuming average rider speed in city traffic is 25 km/h
 * @param {number} prepTimeMinutes
 * @param {number} distanceKm
 * @returns {number} total estimated minutes
 */
const estimateTotalDeliveryTimeMinutes = (prepTimeMinutes = 20, distanceKm = 0) => {
  const averageSpeedKmH = 25;
  const travelMinutes = Math.ceil((distanceKm / averageSpeedKmH) * 60);
  const bufferMinutes = 5; // buffer for parking / handoff
  return prepTimeMinutes + travelMinutes + bufferMinutes;
};

module.exports = {
  calculateDistanceKm,
  calculateDeliveryFee,
  estimateTotalDeliveryTimeMinutes,
};
