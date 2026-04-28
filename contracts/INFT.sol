// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MiliGentsINFT is ERC721, Ownable {
    mapping(uint256 => bytes32) private _metadataHashes;
    mapping(uint256 => string) private _storageURIs;
    mapping(uint256 => uint256) private _versions;

    uint256 private _nextTokenId = 1;

    event INFTMinted(
        uint256 indexed tokenId,
        address indexed owner,
        string storageURI,
        bytes32 metadataHash,
        uint256 version
    );

    event INFTUpdated(
        uint256 indexed tokenId,
        string newStorageURI,
        bytes32 newMetadataHash,
        uint256 newVersion
    );

    constructor() ERC721("MiliGents Intelligence NFT", "MINFT") Ownable(msg.sender) {}

    function mint(
        address to,
        string calldata storageURI,
        bytes32 metadataHash
    ) external onlyOwner returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _storageURIs[tokenId] = storageURI;
        _metadataHashes[tokenId] = metadataHash;
        _versions[tokenId] = 1;
        emit INFTMinted(tokenId, to, storageURI, metadataHash, 1);
        return tokenId;
    }

    function updateStrategy(
        uint256 tokenId,
        string calldata newStorageURI,
        bytes32 newMetadataHash
    ) external onlyOwner {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        _storageURIs[tokenId] = newStorageURI;
        _metadataHashes[tokenId] = newMetadataHash;
        _versions[tokenId] += 1;
        emit INFTUpdated(
            tokenId,
            newStorageURI,
            newMetadataHash,
            _versions[tokenId]
        );
    }

    function getINFT(uint256 tokenId) external view returns (
        string memory storageURI,
        bytes32 metadataHash,
        uint256 version,
        address owner
    ) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return (
            _storageURIs[tokenId],
            _metadataHashes[tokenId],
            _versions[tokenId],
            _ownerOf(tokenId)
        );
    }
}
