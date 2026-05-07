namespace SMD.Application.Contracts.Documents.Responses;

public record SetOutboundLinePriceTierResponse(
    Guid DocumentId,
    Guid LineId,
    int PriceTier
);
