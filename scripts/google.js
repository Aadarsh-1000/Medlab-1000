import dotenv from "dotenv";
dotenv.config();

async function test() {

  try {

    const response = await fetch(
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: "urinary retention causes",
          search_depth: "advanced",
          max_results: 5,
        }),
      }
    );

    const data = await response.json();

    console.log("\nSearch Results:\n");

    console.log(JSON.stringify(data, null, 2));

  } catch (err) {

    console.error("\nSEARCH ERROR:\n");

    console.error(err);

  }

}

test();