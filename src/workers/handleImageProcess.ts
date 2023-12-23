import { Job } from "bullmq";
import { WorkerJob, jobTypes } from "../jobs";

const handleImageProcess = async (job: Job<WorkerJob>) => {
  switch (job.data.type) {
    case jobTypes.IMAGE_PROCESSOR: {
      const { receiptId, url } = job.data.data;
      try {
        console.log(`Starting to process image: ${url}`);
        const response = await fetch(`${process.env.IMAGE_PROCESSOR_URL}/ocr`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.IMAGE_PROCESSOR_API_KEY ?? "",
          },
          body: JSON.stringify({
            url,
            receiptId,
          }),
        });
        if (response.ok) {
          console.log(response.body);
        }
      } catch (err) {
        console.error(`Problem initiating processing of image: ${url}`);
        console.log(err);
      }
      return;
    }
  }
};

export default handleImageProcess;
