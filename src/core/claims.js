import { canonicalize } from './utils.js';
import { sign, verify } from './crypto.js';

/**
 * ClaimManager - Handles username claims and conflict resolution
 */

export class ClaimManager {
    /**
     * Create a new username claim
     * @param {string} username
     * @param {string} publicKey
     * @param {string} privateKey
     * @returns {Object} claim object
     */
    static async createClaim(username, publicKey, privateKey) {
        const claim = {
            username,
            pubKey: publicKey,
            createdAt: Date.now(),
            revoked: false
        };

        const payloadStr = canonicalize({
            username: claim.username,
            pubKey: claim.pubKey,
            createdAt: claim.createdAt,
            revoked: false
        });

        claim.signature = await sign(payloadStr, privateKey);
        return claim;
    }

    /**
     * Resolve the winner from multiple claims (earliest timestamp wins)
     * @param {Array} claims
     * @returns {Object|null} winning claim
     */
    static async resolveWinner(claims) {
        if (!claims || !Array.isArray(claims) || claims.length === 0) {
            return null;
        }

        const activeClaims = claims.filter((c) => !c.revoked);
        if (activeClaims.length === 0) {
            return null;
        }

        const validClaims = [];
        for (const claim of activeClaims) {
            try {
                const payloadStr = canonicalize({
                    username: claim.username,
                    pubKey: claim.pubKey,
                    createdAt: claim.createdAt,
                    revoked: claim.revoked || false
                });

                const isValid = await verify(claim.signature, payloadStr, claim.pubKey);
                if (isValid) {
                    validClaims.push(claim);
                }
            } catch (e) {
                console.warn('Invalid claim signature:', e);
            }
        }

        if (validClaims.length === 0) {
            return null;
        }

        return validClaims.reduce((earliest, current) => {
            return current.createdAt < earliest.createdAt ? current : earliest;
        });
    }
}
