namespace SMD.API.Contracts.CycleCounts;

public class CycleCountListItemDto
{
    public Guid Id { get; set; }
    public string CountNo { get; set; } = "";
    public string Status { get; set; } = "";
    public string? Reference { get; set; }
    public string? Note { get; set; }
    public string ScopeLabel { get; set; } = "";
    public int LineCount { get; set; }
    public int CountedLineCount { get; set; }
    public decimal ExpectedQty { get; set; }
    public decimal CountedQty { get; set; }
    public decimal VarianceQty { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}
