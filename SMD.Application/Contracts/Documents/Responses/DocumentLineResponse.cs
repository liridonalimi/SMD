namespace SMD.Application.Contracts.Documents.Responses;

public sealed record DecrementLineResponse(
    Guid LineId,
    decimal QuantityAfter,
    bool IsDeleted
);
