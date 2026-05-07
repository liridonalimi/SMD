using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace SMD.API.Controllers
{
    [ApiController]
    [Route("api/test")]
    public class TestController : ControllerBase
    {
        // Endpoint publik (pa JWT)
        [HttpGet("public")]
        public IActionResult Public()
        {
            return Ok("PUBLIC ENDPOINT OK");
        }

        // Endpoint i mbrojtur me JWT
        [Authorize]
        [HttpGet("secure")]
        public IActionResult Secure()
        {
            return Ok("JWT IS WORKING");
        }
    }
}