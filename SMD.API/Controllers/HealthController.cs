using Microsoft.AspNetCore.Mvc;

namespace SMD.API.Controllers
{
    [ApiController]
    [Route("api/health")]
    public class HealthController : ControllerBase
    {
        [HttpGet]
        public IActionResult Get() => Ok("SMD API is running");
    }
}
