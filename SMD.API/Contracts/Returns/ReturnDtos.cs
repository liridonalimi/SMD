using SMD.Domain.Enums;

namespace SMD.API.Contracts.Returns;

public record ReturnDraftResponse(Guid Id, string DocumentNo, DocumentStatus Status);

public record ReturnLineResponse(Guid Id);

public record ReturnListItemDto(
    Guid Id,
    string DocumentNo,
    ReturnDocumentType Type,
    DocumentStatus Status,
    Guid? PartnerId,
    string? PartnerCode,
    string? PartnerName,
    string? Reference,
    string? Note,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    int LinesCount,
    decimal DocumentTotal);

public record ReturnDetailsDto(
    Guid Id,
    string DocumentNo,
    ReturnDocumentType Type,
    DocumentStatus Status,
    Guid? CustomerId,
    string? CustomerCode,
    string? CustomerName,
    Guid? SupplierId,
    string? SupplierCode,
    string? SupplierName,
    string? Reference,
    string? Note,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    decimal DocumentTotal,
    IReadOnlyList<ReturnLineDto> Lines);

public record ReturnLineDto(
    Guid Id,
    Guid ProductId,
    string ProductSku,
    string ProductName,
    string? ProductBarcode,
    string? ProductDescription,
    decimal PurchasePrice,
    decimal RetailPrice,
    decimal WholesalePrice,
    decimal VipPrice,
    OutboundPriceTier PriceTier,
    Guid BinId,
    string BinCode,
    string BinName,
    string RackCode,
    string ZoneCode,
    string WarehouseCode,
    string? LotNumber,
    string? BatchNumber,
    DateTime? ExpiryDate,
    decimal Quantity,
    decimal LineTotal);
