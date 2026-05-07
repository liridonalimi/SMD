namespace SMD.Application.Contracts.Documents.Responses;


public record InboundLineDetailsResponse(
    Guid id,
    Guid productId,
    string productSku,
    string productName,
    string? productBarcode,
    string? productDescription,
    decimal purchasePrice,
    decimal retailPrice,
    decimal wholesalePrice,
    decimal vipPrice,
    Guid? toBinId,
    string? toBinCode,
    string? toBinName,
    string? lotNumber,
    string? batchNumber,
    DateTime? expiryDate,
    decimal quantity
    );

public record DocumentPaymentHistoryItemResponse(
    Guid id,
    decimal amount,
    DateTime paymentDate,
    string? reference,
    string? note
);

public record InboundDocumentDetailsResponse(
    Guid id,
    string documentNo,
    int status,
    Guid? supplierId,
    string? supplierCode,
    string? supplierName,
    string? reference,
    string? note,
    DateTime createdAt,
    DateTime? updatedAt,
    decimal documentTotal,
    decimal paidTotal,
    decimal balance,
    string paymentStatus,
    IReadOnlyList<DocumentPaymentHistoryItemResponse> paymentHistory,
    IReadOnlyList<InboundLineDetailsResponse> lines
);
