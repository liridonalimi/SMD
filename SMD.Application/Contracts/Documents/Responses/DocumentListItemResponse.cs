namespace SMD.Application.Contracts.Documents.Responses;

public record DocumentListItemResponse(
    Guid Id,
    string DocumentNo,
    string Status,
    Guid? PartnerId,
    string? PartnerCode,
    string? PartnerName,
    string? Reference,
    string? Note,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    int LinesCount,
    decimal DocumentTotal,
    decimal PaidTotal,
    decimal Balance,
    string PaymentStatus
);
