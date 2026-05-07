namespace SMD.API.Contracts.CycleCounts;

public class UpdateCycleCountLineRequest
{
    public decimal? CountedQty { get; set; }
    public string? Note { get; set; }
}
