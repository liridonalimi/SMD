namespace SMD.API.Contracts.WarehouseTasks;

public class WarehouseTaskDto
{
    public Guid Id { get; set; }
    public string TaskNo { get; set; } = null!;
    public string Type { get; set; } = null!;
    public string Status { get; set; } = null!;
    public Guid? ProductId { get; set; }
    public string? ProductSku { get; set; }
    public string? ProductName { get; set; }
    public Guid? FromBinId { get; set; }
    public string? FromBinCode { get; set; }
    public Guid? ToBinId { get; set; }
    public string? ToBinCode { get; set; }
    public decimal? Quantity { get; set; }
    public Guid? AssignedToUserId { get; set; }
    public string? AssignedToUsername { get; set; }
    public DateTime? AssignedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime? HelpRequestedAt { get; set; }
    public DateTime? HelpResolvedAt { get; set; }
    public long? LeadTimeSeconds { get; set; }
    public string? Reference { get; set; }
    public string? Note { get; set; }
    public string? HelpRequestNote { get; set; }
}
