namespace SMD.API.Contracts.Common;

public class LookupDto
{
    public Guid Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
}
