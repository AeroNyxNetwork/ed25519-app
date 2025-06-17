/**
 * Enhanced Node Registration Service with Caching
 * 
 * Wraps the original service with intelligent caching
 * 
 * @version 1.0.0
 */

import nodeRegistrationService from './nodeRegistration';
import { signatureCacheService } from '../services/SignatureCacheService';
import { apiCacheService } from '../services/ApiCacheService';

const nodeRegistrationCachedService = {
  /**
   * Generate signature message with caching
   */
  async generateSignatureMessage(walletAddress) {
    const cached = apiCacheService.getCachedData('generateSignatureMessage', { walletAddress });
    if (cached) return cached;
    
    const result = await nodeRegistrationService.generateSignatureMessage(walletAddress);
    
    if (result.success) {
      apiCacheService.setCachedData('generateSignatureMessage', { walletAddress }, result);
    }
    
    return result;
  },

  /**
   * Get user nodes overview with caching
   */
  async getUserNodesOverview(walletAddress, signature, message, walletType) {
    const params = { walletAddress, walletType };
    const cached = apiCacheService.getCachedData('nodesOverview', params);
    
    if (cached) {
      console.log('Using cached nodes overview');
      return cached;
    }
    
    const result = await nodeRegistrationService.getUserNodesOverview(
      walletAddress,
      signature,
      message,
      walletType
    );
    
    if (result.success) {
      apiCacheService.setCachedData('nodesOverview', params, result);
    }
    
    return result;
  },

  /**
   * Get node detailed status with caching
   */
  async getNodeDetailedStatus(walletAddress, signature, message, referenceCode, walletType) {
    const params = { walletAddress, referenceCode, walletType };
    const cached = apiCacheService.getCachedData('nodeDetails', params);
    
    if (cached) {
      console.log(`Using cached details for node ${referenceCode}`);
      return cached;
    }
    
    const result = await nodeRegistrationService.getNodeDetailedStatus(
      walletAddress,
      signature,
      message,
      referenceCode,
      walletType
    );
    
    if (result.success) {
      apiCacheService.setCachedData('nodeDetails', params, result);
    }
    
    return result;
  },

  /**
   * Get node performance history with caching
   */
  async getNodePerformanceHistory(walletAddress, signature, message, referenceCode, hours, walletType) {
    const params = { walletAddress, referenceCode, hours, walletType };
    const cached = apiCacheService.getCachedData('performanceHistory', params);
    
    if (cached) {
      console.log(`Using cached performance history for node ${referenceCode}`);
      return cached;
    }
    
    const result = await nodeRegistrationService.getNodePerformanceHistory(
      walletAddress,
      signature,
      message,
      referenceCode,
      hours,
      walletType
    );
    
    if (result.success) {
      apiCacheService.setCachedData('performanceHistory', params, result);
    }
    
    return result;
  },

  /**
   * Get node types with caching
   */
  async getNodeTypes() {
    const cached = apiCacheService.getCachedData('nodeTypes', {});
    if (cached) return cached;
    
    const result = await nodeRegistrationService.getNodeTypes();
    
    if (result.success) {
      apiCacheService.setCachedData('nodeTypes', {}, result);
    }
    
    return result;
  },

  /**
   * Get node resources with caching
   */
  async getNodeResources() {
    const cached = apiCacheService.getCachedData('nodeResources', {});
    if (cached) return cached;
    
    const result = await nodeRegistrationService.getNodeResources();
    
    if (result.success) {
      apiCacheService.setCachedData('nodeResources', {}, result);
    }
    
    return result;
  },

  // Pass through methods that shouldn't be cached
  createNode: nodeRegistrationService.createNode,
  generateRegistrationCode: nodeRegistrationService.generateRegistrationCode,
  checkNodeStatus: nodeRegistrationService.checkNodeStatus
};

export default nodeRegistrationCachedService;
