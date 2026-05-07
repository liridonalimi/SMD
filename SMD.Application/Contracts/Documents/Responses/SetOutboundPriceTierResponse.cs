namespace SMD.Application.Contracts.Documents.Responses;

public record SetOutboundPriceTierResponse(
    Guid DocumentId,
    int PriceTier
);
