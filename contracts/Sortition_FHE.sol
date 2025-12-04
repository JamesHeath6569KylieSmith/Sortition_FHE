// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract Sortition_FHE is SepoliaConfig {
    struct EncryptedMember {
        euint32 memberId;          // Encrypted member identifier
        euint32 governanceWeight;  // Encrypted governance weight
        euint32 lastSelectedRound;  // Encrypted last selected round
    }
    
    struct CommitteeResult {
        uint256[] memberIds;
        uint256 selectionRound;
        bool isRevealed;
    }

    uint256 public memberCount;
    uint256 public currentRound;
    mapping(uint256 => EncryptedMember) public members;
    mapping(uint256 => CommitteeResult) public committeeResults;
    euint32 private encryptedRandomSeed;
    
    event MemberAdded(uint256 indexed memberId);
    event SortitionInitiated(uint256 indexed round);
    event CommitteeSelected(uint256 indexed round);
    
    modifier onlyDAO() {
        _;
    }
    
    function addEncryptedMember(
        euint32 memberId,
        euint32 governanceWeight,
        euint32 lastSelectedRound
    ) public onlyDAO {
        memberCount += 1;
        uint256 newId = memberCount;
        
        members[newId] = EncryptedMember({
            memberId: memberId,
            governanceWeight: governanceWeight,
            lastSelectedRound: lastSelectedRound
        });
        
        emit MemberAdded(newId);
    }
    
    function initiateSortition() public onlyDAO {
        currentRound += 1;
        
        bytes32[] memory ciphertexts = new bytes32[](memberCount * 3);
        for (uint i = 1; i <= memberCount; i++) {
            ciphertexts[(i-1)*3] = FHE.toBytes32(members[i].memberId);
            ciphertexts[(i-1)*3+1] = FHE.toBytes32(members[i].governanceWeight);
            ciphertexts[(i-1)*3+2] = FHE.toBytes32(members[i].lastSelectedRound);
        }
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.selectCommittee.selector);
        committeeResults[reqId] = CommitteeResult({
            memberIds: new uint256[](0),
            selectionRound: currentRound,
            isRevealed: false
        });
        
        emit SortitionInitiated(currentRound);
    }
    
    function selectCommittee(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (uint256[] memory selectedIds, uint256 round) = abi.decode(cleartexts, (uint256[], uint256));
        
        committeeResults[requestId] = CommitteeResult({
            memberIds: selectedIds,
            selectionRound: round,
            isRevealed: true
        });
        
        emit CommitteeSelected(round);
    }
    
    function getCommitteeResult(uint256 round) public view returns (
        uint256[] memory memberIds,
        uint256 selectionRound,
        bool isRevealed
    ) {
        CommitteeResult storage result = committeeResults[round];
        return (
            result.memberIds,
            result.selectionRound,
            result.isRevealed
        );
    }
    
    function calculateSelectionProbability(
        euint32 governanceWeight,
        euint32 lastSelectedRound,
        euint32 currentRound
    ) public pure returns (euint32) {
        euint32 roundDiff = FHE.sub(currentRound, lastSelectedRound);
        return FHE.mul(
            governanceWeight,
            roundDiff
        );
    }
    
    function generateRandomSelection(
        euint32[] memory probabilities,
        euint32 totalProbability
    ) public pure returns (euint32) {
        euint32 randomPoint = FHE.rand();
        euint32 cumulative = FHE.asEuint32(0);
        euint32 selected = FHE.asEuint32(0);
        
        for (uint i = 0; i < probabilities.length; i++) {
            cumulative = FHE.add(cumulative, probabilities[i]);
            selected = FHE.select(
                FHE.and(
                    FHE.lte(randomPoint, cumulative),
                    FHE.gt(randomPoint, FHE.sub(cumulative, probabilities[i]))
                ),
                FHE.asEuint32(i+1),
                selected
            );
        }
        
        return selected;
    }
    
    function verifySelectionFairness(
        euint32[] memory selectedIndices,
        euint32[] memory expectedProbabilities
    ) public pure returns (ebool) {
        euint32 totalDeviation = FHE.asEuint32(0);
        
        for (uint i = 0; i < selectedIndices.length; i++) {
            euint32 count = FHE.asEuint32(0);
            
            for (uint j = 0; j < selectedIndices.length; j++) {
                count = FHE.add(
                    count,
                    FHE.select(
                        FHE.eq(selectedIndices[j], FHE.asEuint32(i+1)),
                        FHE.asEuint32(1),
                        FHE.asEuint32(0)
                    )
                );
            }
            
            euint32 deviation = FHE.sub(
                count,
                expectedProbabilities[i]
            );
            
            totalDeviation = FHE.add(
                totalDeviation,
                FHE.abs(deviation)
            );
        }
        
        return FHE.lte(
            totalDeviation,
            FHE.asEuint32(selectedIndices.length / 10)
        );
    }
    
    function updateMemberSelectionRound(
        uint256 memberId,
        uint256 currentRound
    ) public onlyDAO {
        members[memberId].lastSelectedRound = FHE.asEuint32(currentRound);
    }
}