namespace SMD.Application.Contracts.Documents.Responses;

public record OutboundLineDetailsResponse(
    Guid Id,
    Guid ProductId,
    string ProductSku,
    string ProductName,
    string? ProductBarcode,
    string? ProductDescription,
    int PriceTier,
    decimal PurchasePrice,
    decimal RetailPrice,
    decimal WholesalePrice,
    decimal VipPrice,
    Guid FromBinId,
    string FromBinCode,
    string FromBinName,
    string? LotNumber,
    string? BatchNumber,
    DateTime? ExpiryDate,
    decimal Quantity,
    decimal ReservedQuantity
);

public record OutboundDocumentDetailsResponse(
    Guid Id,
    string DocumentNo,
    int Status,
    int PriceTier,
    Guid? CustomerId,
    string? CustomerCode,
    string? CustomerName,
    string? Reference,
    string? Note,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    decimal DocumentTotal,
    decimal PaidTotal,
    decimal Balance,
    string PaymentStatus,
    IReadOnlyList<DocumentPaymentHistoryItemResponse> PaymentHistory,
    IReadOnlyList<OutboundLineDetailsResponse> Lines
);
